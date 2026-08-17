-- 0018 — tickets.resultat_originale. Ajout sans backfill (ADD COLUMN, idempotent).
--
-- Au règlement, on ne posait que le verdict du RENFORCÉ (tickets.resultat). Le
-- verdict de l'ORIGINAL — « ton ticket serait tombé » — était calculé puis JETÉ.
-- C'est notre preuve principale, irrécupérable pour le passé une fois perdue : on
-- la persiste désormais À CÔTÉ du renforcé, dans le même UPDATE de règlement.
-- NULL pour tout ticket déjà réglé avant cette colonne (irrécupérable, assumé).

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resultat_originale ticket_result;

-- ROLLBACK :
--   ALTER TABLE tickets DROP COLUMN IF EXISTS resultat_originale;
