-- 0016 — C3 : RLS deny-all sur les 8 tables de référence laissées sans RLS.
--
-- Même défense que les tables argent/PII (0000/0001) : on ACTIVE la RLS et on ne
-- pose AUCUNE policy → deny-all. Résultat : les clés PUBLIQUES (anon, authenticated)
-- n'accèdent plus à ces tables via l'API PostgREST. Sans ça, avec les grants Supabase
-- par défaut, n'importe qui tenant la clé anon pouvait LIRE et ÉCRIRE (empoisonner
-- fixtures/teams/team_strength → faux verdicts « fragile » ; lire market_map propriétaire).
--
-- CE QUI N'EST PAS AFFECTÉ (vérifié) :
--   • L'application : accès via la clé service_role (attribut BYPASSRLS) → bypasse la RLS.
--   • Le pipeline Python (collecteur, nocturne) : connexion directe psycopg au pooler
--     Supabase EN TANT QUE rôle `postgres` (propriétaire des tables). Un propriétaire
--     bypasse la RLS tant que FORCE ROW LEVEL SECURITY n'est PAS posé — on ne le pose pas.
-- On ne REVOQUE pas les grants et on ne FORCE pas la RLS : la RLS seule suffit, et
-- c'est exactement le schéma déjà éprouvé sur les tables argent/PII.
--
-- Idempotent (ENABLE est sûr à rejouer ; IF EXISTS protège d'une table absente).

ALTER TABLE IF EXISTS leagues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS fixtures         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS team_strength    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS market_map       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS correction_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS league_catalog   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vision_stats     ENABLE ROW LEVEL SECURITY;

-- ROLLBACK (si le test de chaîne échoue après application) :
--   ALTER TABLE leagues DISABLE ROW LEVEL SECURITY;  (… idem pour les 8)
