-- =========================================================================
-- 0021 — Raison d'abandon de la récupération à la demande. Idempotent.
--
-- POURQUOI. Un appel réussi qui écrit ZÉRO match (`matchs_ecrits = 0`), ou une
-- cible écartée AVANT tout appel (budget épuisé, ligue non mappée), étaient des
-- SILENCES : on ne pouvait pas savoir pourquoi sans relire le code à l'aveugle.
-- On rend l'abandon EXPLICITE et AGRÉGÉ dans `/api/health/ondemand`.
--
--   - `raison` : pourquoi cette entrée n'a rien produit — 'budget' (délai dur
--     atteint avant l'appel), 'ligue_non_mappee', 'deja_connu' (le marché joué
--     avait déjà une proba), 'non_apparie' (event non relié à notre fixture),
--     'devigeage_vide' (le fournisseur a répondu mais aucune cote dévigeable).
--   - `kind = 'skip'` : une cible écartée AVANT tout appel réseau (aucun crédit).
-- =========================================================================

ALTER TABLE ondemand_calls ADD COLUMN IF NOT EXISTS raison TEXT;

-- Étend le domaine de `kind` pour tracer les abandons SANS appel ('skip').
ALTER TABLE ondemand_calls DROP CONSTRAINT IF EXISTS ondemand_calls_kind_check;
ALTER TABLE ondemand_calls
  ADD CONSTRAINT ondemand_calls_kind_check CHECK (kind IN ('league', 'event', 'skip'));
