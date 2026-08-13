-- =========================================================================
-- Muscle Ton Jeu — schéma complet IDEMPOTENT (ré-exécutable sans risque).
-- À utiliser quand l'état de la base est incertain (migration partielle) :
-- crée ce qui manque, ne casse pas ce qui existe. Cible : PostgreSQL / Supabase.
-- Inclut déjà l'adaptation 0002 (selections dénormalisée, sans FK fixture).
-- =========================================================================

-- ---- ENUMS (créés seulement s'ils n'existent pas) -----------------------
DO $$ BEGIN CREATE TYPE market AS ENUM (
  'WIN_HOME','DRAW','WIN_AWAY',
  'DC_HOME_DRAW','DC_DRAW_AWAY','DC_HOME_AWAY',
  'OVER_1_5','UNDER_1_5','OVER_2_5','UNDER_2_5','OVER_3_5','UNDER_3_5',
  'BTTS_YES','BTTS_NO'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE fixture_status AS ENUM ('scheduled','live','finished','postponed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE resolution_state AS ENUM ('certain','ambigu','inconnu'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE ticket_status AS ENUM ('en_lecture','valide','bloque_credits','analyse','archive'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE ticket_result AS ENUM ('en_attente','passe','tombe'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE txn_status AS ENUM ('pending','success','failed','reconciling','refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE ledger_reason AS ENUM ('recharge','debit_analyse','offert','parrainage','remboursement','ajustement'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- DONNÉES SPORTIVES --------------------------------------------------
CREATE TABLE IF NOT EXISTS leagues (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom TEXT NOT NULL, pays TEXT NOT NULL, actif BOOLEAN NOT NULL DEFAULT true, provider_ref TEXT);

CREATE TABLE IF NOT EXISTS teams (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nom TEXT NOT NULL, aliases TEXT[] NOT NULL DEFAULT '{}',
  league_id BIGINT REFERENCES leagues(id), provider_ref TEXT);
CREATE INDEX IF NOT EXISTS teams_aliases_idx ON teams USING GIN (aliases);

CREATE TABLE IF NOT EXISTS fixtures (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date_utc TIMESTAMPTZ NOT NULL,
  team_home_id BIGINT NOT NULL REFERENCES teams(id),
  team_away_id BIGINT NOT NULL REFERENCES teams(id),
  league_id BIGINT NOT NULL REFERENCES leagues(id),
  statut fixture_status NOT NULL DEFAULT 'scheduled',
  score_home SMALLINT, score_away SMALLINT, provider_ref TEXT);
CREATE INDEX IF NOT EXISTS fixtures_date_idx ON fixtures (date_utc);
CREATE INDEX IF NOT EXISTS fixtures_statut_date_idx ON fixtures (statut, date_utc);

CREATE TABLE IF NOT EXISTS team_strength (
  team_id BIGINT NOT NULL REFERENCES teams(id), calcule_le TIMESTAMPTZ NOT NULL,
  attaque_dom REAL NOT NULL, defense_dom REAL NOT NULL,
  attaque_ext REAL NOT NULL, defense_ext REAL NOT NULL,
  PRIMARY KEY (team_id, calcule_le));

CREATE TABLE IF NOT EXISTS predictions (
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id), marche market NOT NULL,
  probabilite NUMERIC(5,4) NOT NULL CHECK (probabilite BETWEEN 0 AND 1),
  confiance NUMERIC(5,4) NOT NULL, calcule_le TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (fixture_id, marche));

-- ---- UTILISATEURS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  google_id TEXT UNIQUE, email TEXT, prenom TEXT,
  credits INTEGER NOT NULL DEFAULT 0, pays TEXT,
  premier_ticket_utilise BOOLEAN NOT NULL DEFAULT false,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS tickets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  statut ticket_status NOT NULL DEFAULT 'en_lecture',
  resultat ticket_result, nb_selections SMALLINT NOT NULL,
  cout_credits SMALLINT NOT NULL DEFAULT 0,
  proba_totale NUMERIC(6,5), proba_renforcee NUMERIC(6,5),
  empreinte TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), analyse_le TIMESTAMPTZ,
  nb_fragiles SMALLINT, nb_retirees SMALLINT);
CREATE INDEX IF NOT EXISTS tickets_user_idx ON tickets (user_id, cree_le DESC);

-- selections SANS clé étrangère fixture (fixtures encore en code), avec libellés.
CREATE TABLE IF NOT EXISTS selections (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  fixture_id BIGINT,
  marche market, etat_resolution resolution_state NOT NULL DEFAULT 'inconnu',
  texte_brut TEXT, cote_saisie NUMERIC(7,2), probabilite NUMERIC(5,4),
  fragile BOOLEAN NOT NULL DEFAULT false,
  retiree_du_renforce BOOLEAN NOT NULL DEFAULT false, ordre SMALLINT NOT NULL,
  match_label TEXT, libelle_fr TEXT, raison TEXT, candidates market[]);
CREATE INDEX IF NOT EXISTS selections_ticket_idx ON selections (ticket_id, ordre);

CREATE TABLE IF NOT EXISTS analyses (
  ticket_id BIGINT PRIMARY KEY REFERENCES tickets(id),
  texte TEXT NOT NULL, image_url TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  montant INTEGER NOT NULL, credits INTEGER NOT NULL,
  statut txn_status NOT NULL DEFAULT 'pending', psp TEXT NOT NULL,
  ref_externe TEXT, cree_le TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions (user_id, cree_le DESC);

-- ---- RÉFÉRENTIELS & OPÉRATIONNEL ---------------------------------------
CREATE TABLE IF NOT EXISTS market_map (
  notation_bookmaker TEXT NOT NULL, marche_interne market NOT NULL, bookmaker TEXT,
  PRIMARY KEY (notation_bookmaker, bookmaker));

CREATE TABLE IF NOT EXISTS ticket_images (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
  url TEXT NOT NULL, empreinte TEXT NOT NULL,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(), purge_apres TIMESTAMPTZ NOT NULL);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL, motif ledger_reason NOT NULL,
  ticket_id BIGINT REFERENCES tickets(id), transaction_id BIGINT REFERENCES transactions(id),
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger (user_id, cree_le DESC);

CREATE TABLE IF NOT EXISTS correction_queue (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  selection_id BIGINT REFERENCES selections(id) ON DELETE CASCADE,
  texte_brut TEXT, correction_type TEXT, resolu BOOLEAN NOT NULL DEFAULT false,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now());

-- ---- Adaptation 0002 pour une base déjà créée par 0001 ------------------
ALTER TABLE selections DROP CONSTRAINT IF EXISTS selections_fixture_id_fkey;
ALTER TABLE selections
  ADD COLUMN IF NOT EXISTS match_label TEXT,
  ADD COLUMN IF NOT EXISTS libelle_fr  TEXT,
  ADD COLUMN IF NOT EXISTS raison      TEXT,
  ADD COLUMN IF NOT EXISTS candidates  market[];
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS nb_fragiles SMALLINT,
  ADD COLUMN IF NOT EXISTS nb_retirees SMALLINT;

-- ---- RLS : deny by default (le serveur service_role contourne) ----------
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_images     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
