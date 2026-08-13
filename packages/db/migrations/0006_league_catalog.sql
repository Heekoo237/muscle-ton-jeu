-- =========================================================================
-- 0006 — Table de correspondance des référentiels de championnat. Idempotent.
--
-- Deux référentiels DIFFÉRENTS coexistent :
--   - football-data (E0, F1, …) : clé de la confiance calibrée (LEAGUE_CONFIDENCE)
--     et du ξ de récence. C'est le référentiel du MODÈLE.
--   - The Odds API (soccer_epl, …) : clé du FOURNISSEUR de cotes.
-- On ne peut pas les confondre. Cette table les relie.
--
-- `leagues.provider_ref` porte le code football-data (E0…) ; il joint
-- `league_catalog.fd_code`, qui donne la clé The Odds API correspondante.
-- =========================================================================

CREATE TABLE IF NOT EXISTS league_catalog (
  fd_code      TEXT PRIMARY KEY,      -- référentiel football-data (E0, F1…)  → modèle
  odds_api_key TEXT NOT NULL,         -- référentiel The Odds API (soccer_epl…) → cotes
  nom          TEXT NOT NULL,
  pays         TEXT NOT NULL
);

-- Les clés The Odds API sont un point de départ ; `verify` les réconcilie avec la
-- liste /sports réelle au premier appel (une clé fausse se corrige ici, 1 ligne).
INSERT INTO league_catalog (fd_code, odds_api_key, nom, pays) VALUES
  ('E0',  'soccer_epl',                 'Premier League',       'Angleterre'),
  ('F1',  'soccer_france_ligue_one',    'Ligue 1',              'France'),
  ('SP1', 'soccer_spain_la_liga',       'La Liga',              'Espagne'),
  ('I1',  'soccer_italy_serie_a',       'Serie A',              'Italie'),
  ('D1',  'soccer_germany_bundesliga',  'Bundesliga',           'Allemagne'),
  ('P1',  'soccer_portugal_primeira_liga','Liga Portugal',      'Portugal'),
  ('B1',  'soccer_belgium_first_div',   'Jupiler Pro League',   'Belgique'),
  ('N1',  'soccer_netherlands_eredivisie','Eredivisie',         'Pays-Bas'),
  ('T1',  'soccer_turkey_super_league', 'Süper Lig',            'Turquie'),
  ('G1',  'soccer_greece_super_league', 'Super League',         'Grèce'),
  ('SC0', 'soccer_spl',                 'Scottish Premiership', 'Écosse')
ON CONFLICT (fd_code) DO UPDATE SET
  odds_api_key = excluded.odds_api_key, nom = excluded.nom, pays = excluded.pays;

-- `leagues.provider_ref` = code football-data → jonction vers le catalogue.
CREATE UNIQUE INDEX IF NOT EXISTS leagues_provider_ref_idx ON leagues (provider_ref);

-- Amorçage des 11 championnats (idempotent). Le collecteur a besoin d'un
-- league_id pour rattacher les matchs relevés ; on les crée ici plutôt que
-- d'attendre une première synchro.
INSERT INTO leagues (nom, pays, provider_ref)
SELECT c.nom, c.pays, c.fd_code FROM league_catalog c
ON CONFLICT (provider_ref) DO NOTHING;

-- Unicité d'une équipe dans un championnat (upsert du collecteur par nom).
CREATE UNIQUE INDEX IF NOT EXISTS teams_league_nom_idx ON teams (league_id, nom);

-- Unicité d'un match par référence fournisseur (upsert du collecteur / synchro).
CREATE UNIQUE INDEX IF NOT EXISTS fixtures_provider_ref_idx ON fixtures (provider_ref);
