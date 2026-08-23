-- 0025 — selections.equipe_dom_id / equipe_ext_id. SNAPSHOT d'ORIENTATION.
--
-- Pourquoi. Une analyse est une PHOTOGRAPHIE : on fige déjà `match_label`, la cote
-- et le marché au moment de l'analyse. L'orientation domicile/extérieur du match doit
-- l'être aussi. Sans ça, le règlement mappe le `marche` figé d'une sélection (ex.
-- WIN_HOME) contre le score COURANT du fixture — et si l'orientation du fixture change
-- après l'analyse (correction fournisseur, dégel), le verdict se retourne. C'est ce
-- qui a produit « le PSG affiché perdant » : le fixture Rennes–PSG était inversé.
--
-- Ce qu'on stocke : l'id de l'équipe DOMICILE et EXTÉRIEUR du fixture, TELS QU'AU
-- MOMENT DE L'ANALYSE. Le règlement compare ce snapshot à l'orientation courante du
-- fixture : identiques → score lu tel quel ; inversés → on permute avant de régler.
-- Ainsi, retourner un fixture ne peut PLUS corrompre un ticket déjà analysé.
--
-- Nullable : les sélections d'AVANT cette migration n'ont pas de snapshot → le
-- règlement retombe sur le comportement actuel (aucune permutation), sans régression.
-- La table `selections` est DÉNORMALISÉE (fixture_id sans FK depuis 0002) : ces
-- colonnes suivent la même règle, de simples BIGINT, pas de FK vers teams.

ALTER TABLE selections
  ADD COLUMN IF NOT EXISTS equipe_dom_id BIGINT,
  ADD COLUMN IF NOT EXISTS equipe_ext_id BIGINT;

-- ROLLBACK :
--   ALTER TABLE selections
--     DROP COLUMN IF EXISTS equipe_dom_id,
--     DROP COLUMN IF EXISTS equipe_ext_id;
