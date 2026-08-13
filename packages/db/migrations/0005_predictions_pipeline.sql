-- =========================================================================
-- 0005 — Pipeline nocturne + collecteur de cotes + surveillance. Idempotent.
--
-- Trois évolutions, décidées avec les règles du pipeline :
--  a) `predictions` HISTORISE au lieu d'écraser : une ligne par
--     (match × marché × jour de calcul). On doit pouvoir reconstruire ce qu'on
--     annonçait un jour donné — c'est la base de l'historique public.
--  b) `odds_snapshots` : sortie du COLLECTEUR (job distinct), une relève toutes
--     les 6 h, mouvements historisés. Ne pas fusionner avec le pipeline.
--  c) `pipeline_runs` : journal d'exécution pour l'idempotence et l'alerte
--     (aucune exécution réussie depuis 36 h → pipeline mort en silence).
--
-- Règle d'archi n°1/2 : `predictions` est alimentée EXCLUSIVEMENT par le job
-- Python. L'application ne fait que LIRE. Aucune écriture depuis l'app, jamais.
-- =========================================================================

-- ---- a) predictions : passage à l'historisation -------------------------
-- Source de la probabilité, par marché (architecture hybride cote/modèle).
DO $$ BEGIN
  CREATE TYPE prediction_source AS ENUM ('odds', 'model', 'repli');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- La table 0001 avait pour clé (fixture_id, marché) : elle ÉCRASE. On la
-- recrée avec le jour de calcul dans la clé. Le pipeline n'ayant jamais tourné,
-- aucune donnée n'est perdue ; le garde évite de casser une base déjà migrée.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'predictions' AND column_name = 'jour_calcul'
  ) THEN
    DROP TABLE IF EXISTS predictions CASCADE;
    CREATE TABLE predictions (
      fixture_id  BIGINT NOT NULL REFERENCES fixtures(id),
      marche      market NOT NULL,
      jour_calcul DATE   NOT NULL,                     -- granularité : un calcul / jour
      probabilite NUMERIC(5,4) NOT NULL CHECK (probabilite BETWEEN 0 AND 1),
      confiance   NUMERIC(5,4) NOT NULL CHECK (confiance BETWEEN 0 AND 1),
      source      prediction_source NOT NULL,
      seuil_fragile NUMERIC(5,4),                      -- seuil applicable (traçabilité)
      calcule_le  TIMESTAMPTZ NOT NULL DEFAULT now(),  -- horodatage précis du dernier calcul du jour
      -- Idempotence : rejouer la même nuit met à jour la même ligne, sans doublon.
      PRIMARY KEY (fixture_id, marche, jour_calcul)
    );
    -- Lecture temps réel : la dernière prédiction connue d'un match.
    CREATE INDEX predictions_latest_idx ON predictions (fixture_id, marche, jour_calcul DESC);
  END IF;
END $$;

-- ---- b) odds_snapshots : sortie du collecteur (historise les mouvements) --
-- Le collecteur relève les cotes toutes les 6 h. Chaque relève est un nouveau
-- point (mouvement de cote). Idempotence : une seule ligne par fenêtre de 6 h
-- (fixture × marché × bookmaker), rejouable sans doublon.
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id),
  marche     market NOT NULL,
  bookmaker  TEXT   NOT NULL DEFAULT 'pinnacle',
  cote       NUMERIC(7,3) NOT NULL CHECK (cote > 1),
  fenetre_6h TIMESTAMPTZ NOT NULL,                     -- début de la fenêtre de 6 h (tronqué)
  releve_le  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, marche, bookmaker, fenetre_6h)
);
CREATE INDEX IF NOT EXISTS odds_snapshots_fixture_idx
  ON odds_snapshots (fixture_id, marche, releve_le DESC);

-- ---- c) pipeline_runs : journal et surveillance -------------------------
DO $$ BEGIN
  CREATE TYPE job_kind AS ENUM ('nightly', 'collector');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE run_status AS ENUM ('running', 'success', 'partial', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job              job_kind   NOT NULL,
  jour_calcul      DATE,                               -- pour la nocturne (idempotence / jour)
  statut           run_status NOT NULL DEFAULT 'running',
  fixtures_traites INTEGER    NOT NULL DEFAULT 0,
  -- Comptes par championnat et par source (odds/model/repli) — exigé pour le suivi.
  detail           JSONB,
  erreur           TEXT,
  demarre_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
  termine_le       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pipeline_runs_job_idx ON pipeline_runs (job, demarre_le DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_success_idx
  ON pipeline_runs (job, termine_le DESC) WHERE statut = 'success';

-- ---- RLS : deny by default (seul le serveur/le job y accèdent) ----------
ALTER TABLE predictions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs  ENABLE ROW LEVEL SECURITY;
-- Aucune policy : le SDK anon ne lit rien. Le job Python (service_role /
-- connexion directe) contourne le RLS pour écrire ; l'app lit via le serveur.
