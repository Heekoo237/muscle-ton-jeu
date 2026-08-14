-- =========================================================================
-- 0009 — Régime de couverture par compétition + fréquence graduée. Idempotent.
--
-- On élargit la couverture à TOUT ce que le fournisseur price (CLAUDE.md, §
-- Univers de couverture). Deux régimes coexistent désormais dans la même table
-- `predictions`, distingués par `source` :
--   - MODÈLE  : championnat backtesté (source odds/model/repli/model_marge_excessive) ;
--   - COTE    : championnat non backtesté → cote dé-vigée seule (cote_seule) ou
--               dérivée arithmétiquement d'une cote (cote_derivee, ex. double chance).
--
-- La double chance en régime cote est CALCULÉE, pas cotée (P(1X)=P(1)+P(X)…) :
-- source « cote_derivee », distincte de « cote_seule », pour pouvoir SÉPARER à la
-- calibration ce qui vient d'une cote de ce qu'on en a déduit.
-- =========================================================================

-- Nouvelles sources de probabilité (ADD VALUE hors transaction, comme 0008).
ALTER TYPE prediction_source ADD VALUE IF NOT EXISTS 'cote_seule';
ALTER TYPE prediction_source ADD VALUE IF NOT EXISTS 'cote_derivee';

-- Régime + fréquence de relevé, portés par la table de correspondance des
-- championnats. Défaut prudent : une compétition nouvellement ajoutée par
-- catalogue_sync est en COTE SEULE, 1 relevé/jour, tant qu'elle n'est pas promue.
ALTER TABLE league_catalog
  ADD COLUMN IF NOT EXISTS regime TEXT NOT NULL DEFAULT 'cote_seule'
    CHECK (regime IN ('modele', 'cote_seule'));
ALTER TABLE league_catalog
  ADD COLUMN IF NOT EXISTS releves_par_jour SMALLINT NOT NULL DEFAULT 1
    CHECK (releves_par_jour BETWEEN 1 AND 4);

-- Les 11 championnats backtestés sont en régime MODÈLE, 4 relevés/jour (on garde
-- l'historique de mouvements pour le backtest). Idempotent.
UPDATE league_catalog
   SET regime = 'modele', releves_par_jour = 4
 WHERE fd_code IN ('E0','F1','SP1','I1','D1','P1','B1','N1','T1','G1','SC0');
