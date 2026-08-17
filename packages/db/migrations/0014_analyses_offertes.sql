-- 0014 — Bêta : compteur d'analyses offertes par compte (remplace le booléen
-- premier_ticket_utilise dans la LOGIQUE ; la colonne booléenne est conservée le
-- temps de la bascule, plus lue ensuite).
--
-- On stocke le CONSOMMÉ, pas le restant : le plafond vit dans le code
-- (ANALYSES_OFFERTES). Repasser de 7 à 1 après la bêta ne demande aucune migration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS analyses_offertes_utilisees INTEGER NOT NULL DEFAULT 0;

-- Backfill : un compte qui avait déjà grillé son offre unique = 1 analyse consommée.
UPDATE users SET analyses_offertes_utilisees = 1 WHERE premier_ticket_utilise = true;

-- Consomme UNE analyse offerte, atomiquement et une seule fois. L'UPDATE conditionnel
-- (< plafond) n'incrémente que s'il en reste : deux confirmations concurrentes ne
-- peuvent pas en accorder deux (même garde que confirmer_recharge). TRUE si accordée.
CREATE OR REPLACE FUNCTION consommer_analyse_offerte(p_user BIGINT, p_plafond INT)
RETURNS BOOLEAN AS $$
DECLARE
  v_id BIGINT;
BEGIN
  UPDATE users
     SET analyses_offertes_utilisees = analyses_offertes_utilisees + 1
   WHERE id = p_user
     AND analyses_offertes_utilisees < p_plafond
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
