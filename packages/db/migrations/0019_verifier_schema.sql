-- 0019 — verifier_schema : moteur de détection du DÉCALAGE code/base.
--
-- Deux fois un déploiement a cassé le produit parce que le code attendait une
-- colonne/fonction que la base n'avait pas, sans rien signaler avant le clic d'un
-- utilisateur. Cette fonction lit un MANIFESTE (packages/db/schema_manifest.json,
-- source de vérité unique du contrat code↔base) et renvoie UNIQUEMENT ce qui MANQUE,
-- avec le numéro de migration correspondant — lisible tel quel.
--
-- Pourquoi une fonction SQL et pas une lecture directe côté app : l'app parle à la
-- base via PostgREST (supabase-js), qui n'expose ni information_schema ni pg_proc.
-- On encapsule donc l'introspection ici. La surveillance Python (health.py) l'appelle
-- aussi — un SEUL moteur, un SEUL manifeste, deux consommateurs.
--
-- Lecture seule, idempotente. Ne renvoie RIEN quand tout est présent.

CREATE OR REPLACE FUNCTION verifier_schema(p_manifest jsonb)
RETURNS TABLE(objet text, migration text) AS $$
  -- Colonnes attendues, absentes.
  SELECT (c->>'table') || '.' || (c->>'column'), c->>'migration'
    FROM jsonb_array_elements(coalesce(p_manifest->'columns', '[]'::jsonb)) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name  = c->>'table'
        AND ic.column_name = c->>'column')
  UNION ALL
  -- Tables attendues, absentes.
  SELECT (t->>'table'), t->>'migration'
    FROM jsonb_array_elements(coalesce(p_manifest->'tables', '[]'::jsonb)) AS t
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.tables it
      WHERE it.table_schema = 'public'
        AND it.table_name = t->>'table')
  UNION ALL
  -- Fonctions attendues, absentes.
  SELECT 'fonction ' || (f->>'name'), f->>'migration'
    FROM jsonb_array_elements(coalesce(p_manifest->'functions', '[]'::jsonb)) AS f
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = f->>'name');
$$ LANGUAGE sql STABLE;

-- ROLLBACK :
--   DROP FUNCTION IF EXISTS verifier_schema(jsonb);
