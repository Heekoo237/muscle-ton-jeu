-- 0018 — Deux ajouts indépendants et sans backfill (ADD COLUMN / CREATE FUNCTION,
-- idempotents). Aucun impact sur les données existantes.
--
-- 1) tickets.resultat_originale : au règlement, on ne posait que le verdict du
--    RENFORCÉ (tickets.resultat). Le verdict de l'ORIGINAL — « ton ticket serait
--    tombé » — était calculé puis JETÉ. C'est notre preuve principale et elle est
--    irrécupérable pour le passé : on la persiste désormais À CÔTÉ du renforcé.
--    NULL pour tout ticket déjà réglé avant cette colonne (irrécupérable, assumé).
--
-- 2) Deux fonctions d'agrégat en LECTURE SEULE pour le tableau de bord superadmin.
--    Elles ne renvoient QUE des entiers — structurellement AUCUNE donnée nominative
--    ne peut en sortir (pas d'e-mail, pas de numéro, pas de contenu de ticket). Une
--    requête par bloc (inscriptions / analyses), chacune deux nombres.

-- 1) Verdict de l'original, posé au règlement à côté du renforcé (tickets.resultat).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resultat_originale ticket_result;

-- 2a) Inscriptions : total des comptes + nouveaux depuis p_depuis.
CREATE OR REPLACE FUNCTION admin_stats_inscriptions(p_depuis TIMESTAMPTZ)
RETURNS TABLE(total BIGINT, periode BIGINT) AS $$
  SELECT count(*), count(*) FILTER (WHERE cree_le >= p_depuis)
    FROM users;
$$ LANGUAGE sql STABLE;

-- 2b) Analyses : total des tickets analysés + analysés depuis p_depuis.
--     « Analysé » = analyse_le renseigné (marqueur stable, insensible à un archivage
--     ultérieur du ticket, contrairement à statut = 'analyse').
CREATE OR REPLACE FUNCTION admin_stats_analyses(p_depuis TIMESTAMPTZ)
RETURNS TABLE(total BIGINT, periode BIGINT) AS $$
  SELECT count(*) FILTER (WHERE analyse_le IS NOT NULL),
         count(*) FILTER (WHERE analyse_le >= p_depuis)
    FROM tickets;
$$ LANGUAGE sql STABLE;

-- ROLLBACK (si besoin) :
--   DROP FUNCTION IF EXISTS admin_stats_analyses(TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS admin_stats_inscriptions(TIMESTAMPTZ);
--   ALTER TABLE tickets DROP COLUMN IF EXISTS resultat_originale;
