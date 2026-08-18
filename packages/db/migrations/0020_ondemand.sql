-- =========================================================================
-- 0020 — Récupération À LA DEMANDE des cotes manquantes. Idempotent.
--
-- Nouveau chemin, VALIDÉ produit : à la VALIDATION d'un ticket (chemin d'ÉCRITURE,
-- jamais la lecture temps réel de /resultat), si une ligne résolue n'a pas encore
-- de probabilité, on interroge The Odds API pour ce championnat, on DÉVIGE (même
-- fonction que le collecteur, portée en TS et verrouillée par test doré) et on
-- écrit dans `predictions` en source `cote_seule`/`cote_derivee`. Puis /resultat LIT.
--
-- Cela n'entame AUCUNE règle d'or : la probabilité vient d'un calcul déterministe
-- (dévigeage), jamais d'un LLM ; le chemin temps réel LIT toujours (règle d'archi
-- n°2) — l'écriture est faite AVANT, au clic « Analyser mon ticket ». C'est la
-- levée EXPLICITE et bornée du « aucune écriture depuis l'app » de 0005 : l'app
-- écrit ici, et SEULEMENT ici, des lignes cote seule, jamais une proba modèle.
--
-- Cette table sert DEUX consommateurs, comme le manifeste de schéma :
--   1) JOURNAL (exigence produit « journalise tout ») — appels/jour, succès,
--      crédits fournisseur consommés, matchs écrits ;
--   2) DISJONCTEUR (« garde-fou de panne ») — si le taux d'échec sur une fenêtre
--      récente dépasse un seuil, on CESSE d'appeler et on retombe sur le
--      collecteur seul (avec alerte via la surveillance qui lit ce journal).
-- =========================================================================

CREATE TABLE IF NOT EXISTS ondemand_calls (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cle           TEXT NOT NULL,                 -- 'league:soccer_epl' | 'event:<eventId>'
  kind          TEXT NOT NULL CHECK (kind IN ('league', 'event')),
  ok            BOOLEAN NOT NULL,
  credits       INTEGER NOT NULL DEFAULT 0,    -- crédits fournisseur (en-tête x-requests-last)
  matchs_ecrits INTEGER NOT NULL DEFAULT 0,    -- lignes predictions écrites suite à cet appel
  erreur        TEXT,
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Le disjoncteur et le journal du jour lisent la fenêtre récente : index dédié.
CREATE INDEX IF NOT EXISTS ondemand_calls_recent_idx ON ondemand_calls (cree_le DESC);

-- Deny-all : seul le serveur (service_role) écrit et lit ce journal.
ALTER TABLE ondemand_calls ENABLE ROW LEVEL SECURITY;

-- Disjoncteur : VRAI (ouvert → on cesse d'appeler) si, sur la fenêtre `p_fenetre_s`,
-- il y a eu AU MOINS `p_min_essais` appels ET une part d'échecs ≥ `p_seuil`. Sous le
-- minimum d'essais, on ne conclut rien (jamais couper sur un seul raté) : FALSE.
CREATE OR REPLACE FUNCTION ondemand_circuit_ouvert(
  p_fenetre_s INT, p_min_essais INT, p_seuil NUMERIC
) RETURNS BOOLEAN AS $$
DECLARE
  v_total  INT;
  v_echecs INT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT ok)
    INTO v_total, v_echecs
    FROM ondemand_calls
   WHERE cree_le >= now() - make_interval(secs => p_fenetre_s);
  IF v_total < p_min_essais THEN
    RETURN FALSE;
  END IF;
  RETURN (v_echecs::numeric / v_total) >= p_seuil;
END;
$$ LANGUAGE plpgsql;
