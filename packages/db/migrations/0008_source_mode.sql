-- =========================================================================
-- 0008 — Bascule cote ↔ modèle sur marge excessive, avec hystérésis. Idempotent.
--
-- Quand le seul bookmaker disponible pour une ligue est trop margé (> 10 % sur
-- 7 j), sa cote 1X2 n'est plus fiable : on bascule cette ligue sur le MODÈLE.
-- On distingue ce cas d'un marché sans cote : source « model_marge_excessive ».
-- L'état (mode courant + marge 7 j) est mémorisé pour appliquer l'hystérésis
-- (retour à la cote seulement sous 8 %) et journaliser chaque bascule.
-- =========================================================================

-- Nouvelle valeur d'enum (PG 12+ : IF NOT EXISTS, hors transaction via psql -f).
ALTER TYPE prediction_source ADD VALUE IF NOT EXISTS 'model_marge_excessive';

CREATE TABLE IF NOT EXISTS league_source_state (
  fd_code    TEXT PRIMARY KEY REFERENCES league_catalog(fd_code),
  mode       TEXT NOT NULL DEFAULT 'odds' CHECK (mode IN ('odds', 'model')),
  marge_7j   NUMERIC(5,4),          -- dernière marge moyenne 7 j observée
  bascule_le TIMESTAMPTZ,           -- date de la dernière bascule
  maj_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE league_source_state ENABLE ROW LEVEL SECURITY;
