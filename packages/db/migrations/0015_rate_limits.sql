-- 0015 — Limitation de débit (C1). Fenêtre fixe atomique, partagée entre toutes les
-- instances serverless (une limite en mémoire par instance ne tiendrait pas : Vercel
-- répartit les requêtes). Sert à borner les endpoints coûteux — d'abord l'appel
-- vision de /analyser, non authentifié et sans limite jusqu'ici.

CREATE TABLE IF NOT EXISTS rate_limits (
  cle           TEXT PRIMARY KEY,
  fenetre_debut TIMESTAMPTZ NOT NULL DEFAULT now(),
  compte        INTEGER NOT NULL DEFAULT 0
);
-- Deny-all : uniquement le service_role (serveur) y touche.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Incrémente atomiquement le compteur de `p_cle` sur une fenêtre de `p_fenetre_s`
-- secondes ; réinitialise si la fenêtre est expirée. Renvoie TRUE si la requête est
-- AUTORISÉE (compteur <= p_max), FALSE si elle dépasse.
CREATE OR REPLACE FUNCTION hit_rate_limit(p_cle TEXT, p_fenetre_s INT, p_max INT)
RETURNS BOOLEAN AS $$
DECLARE
  v_compte INT;
BEGIN
  INSERT INTO rate_limits (cle, fenetre_debut, compte)
    VALUES (p_cle, now(), 1)
  ON CONFLICT (cle) DO UPDATE SET
    compte = CASE
      WHEN rate_limits.fenetre_debut < now() - make_interval(secs => p_fenetre_s) THEN 1
      ELSE rate_limits.compte + 1
    END,
    fenetre_debut = CASE
      WHEN rate_limits.fenetre_debut < now() - make_interval(secs => p_fenetre_s) THEN now()
      ELSE rate_limits.fenetre_debut
    END
  RETURNING compte INTO v_compte;
  RETURN v_compte <= p_max;
END;
$$ LANGUAGE plpgsql;
