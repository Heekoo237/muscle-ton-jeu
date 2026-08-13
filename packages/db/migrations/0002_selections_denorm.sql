-- =========================================================================
-- 0002 — Adaptation de `selections` à la phase « données factices en code ».
--
-- Les matchs/probabilités factices vivent encore dans le code (pas en base),
-- donc `selections.fixture_id` ne référence pas une vraie ligne `fixtures`.
-- On relâche la contrainte de clé étrangère et on stocke les libellés d'affichage
-- directement sur la sélection. Quand le pipeline réel remplira `fixtures`, on
-- pourra rétablir la normalisation.
-- =========================================================================

ALTER TABLE selections DROP CONSTRAINT IF EXISTS selections_fixture_id_fkey;

ALTER TABLE selections
  ADD COLUMN IF NOT EXISTS match_label TEXT,
  ADD COLUMN IF NOT EXISTS libelle_fr  TEXT,
  ADD COLUMN IF NOT EXISTS raison      TEXT,
  ADD COLUMN IF NOT EXISTS candidates  market[];

-- Chiffres du résultat figés à l'affichage (le dashboard les lit sans recalcul).
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS nb_fragiles SMALLINT,
  ADD COLUMN IF NOT EXISTS nb_retirees SMALLINT;
