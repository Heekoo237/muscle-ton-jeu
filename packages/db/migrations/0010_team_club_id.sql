-- =========================================================================
-- 0010 — Un club = un club_id, quelle que soit la compétition. Idempotent.
--
-- Les équipes sont enregistrées PAR COMPÉTITION (« Reims » en Ligue 1 backfillé,
-- « Stade de Reims » en Ligue 2 collecté) : un même club a plusieurs lignes. On
-- ne fusionne PAS les lignes (l'historique par championnat reste séparé, ce qui
-- est CORRECT pour Dixon-Coles) — on les REGROUPE sous un club_id commun. La
-- compétition reste portée par le MATCH (fixtures.league_id), le club par le club_id.
--
-- Colonnes ajoutées, pas de données touchées ici. Le regroupement (club_id/club_key)
-- est écrit par `python -m mtj_model.pipeline.reconcile`, qui applique EXACTEMENT
-- les regroupements du rapport dry-run, MOINS toute collision de co-occurrence.
-- =========================================================================

ALTER TABLE teams ADD COLUMN IF NOT EXISTS club_id  BIGINT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS club_key TEXT;

CREATE INDEX IF NOT EXISTS teams_club_id_idx  ON teams (club_id);
CREATE INDEX IF NOT EXISTS teams_club_key_idx ON teams (club_key);
