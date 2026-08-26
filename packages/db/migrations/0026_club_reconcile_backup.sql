-- 0026 — club_reconcile_backup. POINT DE RETOUR de la réconciliation club_id.
--
-- Pourquoi. `reconcile` réattribue le `club_id` (et le `club_key`) de TOUTES les
-- équipes en une passe. C'est une mutation de masse sur de la donnée de production.
-- La garde anti-collision annule la transaction si deux adversaires se retrouvaient
-- fusionnés — mais on veut AUSSI pouvoir revenir en arrière APRÈS coup, si un effet
-- indésirable n'apparaît qu'à l'usage.
--
-- Ce qu'on stocke : l'état (team_id, club_id, club_key) de CHAQUE équipe JUSTE AVANT
-- l'application. Un seul point de retour à la fois : `reconcile` vide la table puis
-- réécrit l'instantané courant. `reconcile_rollback` le restaure tel quel.
--
-- Pas de FK (comme le reste du schéma dénormalisé) : de simples colonnes, pour que la
-- restauration ne dépende de rien d'autre que d'elle-même.
--
-- NB : table INTERNE au pipeline (jamais lue par l'app) — hors schema_manifest. Cette
-- migration est la DDL canonique, mais `reconcile`/`reconcile_rollback` la créent
-- aussi en `create table if not exists` : le job ne dépend PAS de l'ordre d'application
-- des migrations. (Cette DDL et celle du code doivent rester identiques.)

CREATE TABLE IF NOT EXISTS club_reconcile_backup (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
  team_id        BIGINT NOT NULL,
  club_id_avant  BIGINT,
  club_key_avant TEXT
);

-- ROLLBACK :
--   DROP TABLE IF EXISTS club_reconcile_backup;
