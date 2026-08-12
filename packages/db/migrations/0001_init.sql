-- =========================================================================
-- Muscle Ton Jeu — schéma initial (brief §7, étendu)
-- Cible : PostgreSQL / Supabase. Source de vérité du schéma, partagée web+model.
--
-- Accès : la logique métier lit/écrit côté SERVEUR (clé service_role). Le RLS
-- est activé en défense en profondeur (deny by default), jamais comme mécanisme
-- principal — règle d'archi n°8 : le serveur décide ce qu'il envoie au client.
-- =========================================================================

-- ---- ENUMS --------------------------------------------------------------
CREATE TYPE market AS ENUM (
  'WIN_HOME','DRAW','WIN_AWAY',
  'DC_HOME_DRAW','DC_DRAW_AWAY','DC_HOME_AWAY',
  'OVER_1_5','UNDER_1_5','OVER_2_5','UNDER_2_5','OVER_3_5','UNDER_3_5',
  'BTTS_YES','BTTS_NO'
);
CREATE TYPE fixture_status   AS ENUM ('scheduled','live','finished','postponed','cancelled');
CREATE TYPE resolution_state AS ENUM ('certain','ambigu','inconnu'); -- jamais 'probable'
CREATE TYPE ticket_status    AS ENUM ('en_lecture','valide','bloque_credits','analyse','archive');
CREATE TYPE ticket_result    AS ENUM ('en_attente','passe','tombe');
CREATE TYPE txn_status        AS ENUM ('pending','success','failed','reconciling','refunded');
CREATE TYPE ledger_reason     AS ENUM ('recharge','debit_analyse','offert','parrainage','remboursement','ajustement');

-- ---- DONNÉES SPORTIVES --------------------------------------------------
CREATE TABLE leagues (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom          TEXT NOT NULL,
  pays         TEXT NOT NULL,
  actif        BOOLEAN NOT NULL DEFAULT true,
  provider_ref TEXT
);

CREATE TABLE teams (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom          TEXT NOT NULL,
  aliases      TEXT[] NOT NULL DEFAULT '{}',       -- actif propriétaire, enrichi aux corrections
  league_id    BIGINT REFERENCES leagues(id),
  provider_ref TEXT
);
CREATE INDEX teams_aliases_idx ON teams USING GIN (aliases);

CREATE TABLE fixtures (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date_utc     TIMESTAMPTZ NOT NULL,
  team_home_id BIGINT NOT NULL REFERENCES teams(id),
  team_away_id BIGINT NOT NULL REFERENCES teams(id),
  league_id    BIGINT NOT NULL REFERENCES leagues(id),
  statut       fixture_status NOT NULL DEFAULT 'scheduled',
  score_home   SMALLINT,
  score_away   SMALLINT,
  provider_ref TEXT
);
CREATE INDEX fixtures_date_idx        ON fixtures (date_utc);            -- fenêtre 7 jours
CREATE INDEX fixtures_statut_date_idx ON fixtures (statut, date_utc);

CREATE TABLE team_strength (
  team_id     BIGINT NOT NULL REFERENCES teams(id),
  calcule_le  TIMESTAMPTZ NOT NULL,
  attaque_dom REAL NOT NULL, defense_dom REAL NOT NULL,
  attaque_ext REAL NOT NULL, defense_ext REAL NOT NULL,
  PRIMARY KEY (team_id, calcule_le)
);

-- Alimentée EXCLUSIVEMENT par le pipeline nocturne (règle d'archi n°1).
CREATE TABLE predictions (
  fixture_id  BIGINT NOT NULL REFERENCES fixtures(id),
  marche      market NOT NULL,
  probabilite NUMERIC(5,4) NOT NULL CHECK (probabilite BETWEEN 0 AND 1),
  confiance   NUMERIC(5,4) NOT NULL,
  calcule_le  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (fixture_id, marche)
);

-- ---- UTILISATEURS -------------------------------------------------------
CREATE TABLE users (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  google_id              TEXT UNIQUE,
  email                  TEXT,
  prenom                 TEXT,
  credits                INTEGER NOT NULL DEFAULT 0,   -- solde dénormalisé (source = credit_ledger)
  pays                   TEXT,
  premier_ticket_utilise BOOLEAN NOT NULL DEFAULT false,
  cree_le                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         BIGINT REFERENCES users(id),
  statut          ticket_status NOT NULL DEFAULT 'en_lecture',
  resultat        ticket_result,                        -- réglé après les matchs
  nb_selections   SMALLINT NOT NULL,
  cout_credits    SMALLINT NOT NULL DEFAULT 0,
  proba_totale    NUMERIC(6,5),
  proba_renforcee NUMERIC(6,5),
  empreinte       TEXT,                                 -- hash anti-doublon (24 h → gratuit)
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyse_le      TIMESTAMPTZ
);
CREATE INDEX tickets_user_idx ON tickets (user_id, cree_le DESC);

CREATE TABLE selections (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id           BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  fixture_id          BIGINT REFERENCES fixtures(id),   -- NULL tant que non résolu
  marche              market,                            -- NULL si inconnu/non couvert
  etat_resolution     resolution_state NOT NULL DEFAULT 'inconnu',
  texte_brut          TEXT,
  cote_saisie         NUMERIC(7,2),
  probabilite         NUMERIC(5,4),                      -- copiée depuis predictions
  fragile             BOOLEAN NOT NULL DEFAULT false,
  retiree_du_renforce BOOLEAN NOT NULL DEFAULT false,
  ordre               SMALLINT NOT NULL                  -- index d'appariement 01–20
);
CREATE INDEX selections_ticket_idx ON selections (ticket_id, ordre);

CREATE TABLE analyses (
  ticket_id BIGINT PRIMARY KEY REFERENCES tickets(id),
  texte     TEXT NOT NULL,
  image_url TEXT,
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  montant     INTEGER NOT NULL,
  credits     INTEGER NOT NULL,
  statut      txn_status NOT NULL DEFAULT 'pending',
  psp         TEXT NOT NULL,
  ref_externe TEXT,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_idx ON transactions (user_id, cree_le DESC);

-- ---- RÉFÉRENTIELS -------------------------------------------------------
CREATE TABLE market_map (               -- actif propriétaire, enrichi à la main
  notation_bookmaker TEXT NOT NULL,
  marche_interne     market NOT NULL,
  bookmaker          TEXT,
  PRIMARY KEY (notation_bookmaker, bookmaker)
);

-- ---- TABLES OPÉRATIONNELLES (impliquées par PRD/brief) ------------------
CREATE TABLE ticket_images (            -- captures + empreinte, purge à 30 j
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id   BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  empreinte   TEXT NOT NULL,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_apres TIMESTAMPTZ NOT NULL
);

CREATE TABLE credit_ledger (            -- source de vérité du solde (débit à l'affichage)
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id),
  delta          INTEGER NOT NULL,
  motif          ledger_reason NOT NULL,
  ticket_id      BIGINT REFERENCES tickets(id),
  transaction_id BIGINT REFERENCES transactions(id),
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_user_idx ON credit_ledger (user_id, cree_le DESC);

CREATE TABLE correction_queue (         -- brief §7.1 : chaque correction alimente la revue manuelle
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  selection_id    BIGINT REFERENCES selections(id) ON DELETE CASCADE,
  texte_brut      TEXT,
  correction_type TEXT,
  resolu          BOOLEAN NOT NULL DEFAULT false,
  cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (       -- Web Push (VAPID)
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh   TEXT NOT NULL,
  auth     TEXT NOT NULL,
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- RLS : deny by default sur les tables utilisateur -------------------
-- Aucune policy définie ⇒ le SDK anon ne lit rien. Le serveur (service_role)
-- contourne le RLS. Les policies fines viendront avec l'auth réelle (Session 8).
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_images     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
