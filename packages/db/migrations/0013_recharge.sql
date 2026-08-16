-- 0013 — Parcours de recharge Mobile Money : cycle de vie complet + idempotence.
--
-- Ce qui fait la différence entre un paiement qui marche et un paiement qui perd de
-- l'argent : le crédit posé UNE fois, sur confirmation, jamais avant ; une référence
-- unique par transaction ; un état explicite à chaque étape.

-- Cinq états. On complète l'enum existant (pending/success/failed/…) avec les deux
-- manquants. ADD VALUE IF NOT EXISTS : sûr à rejouer.
ALTER TYPE txn_status ADD VALUE IF NOT EXISTS 'initiated';
ALTER TYPE txn_status ADD VALUE IF NOT EXISTS 'expired';
--   initiated : créée, avant contact opérateur
--   pending   : opérateur contacté, on attend la confirmation (« en attente »)
--   success   : confirmée → crédit posé
--   failed    : code refusé, solde insuffisant…
--   expired   : délai dépassé, jamais confirmée

-- Champs du cycle de vie. `reference` est la clé montrée à l'utilisateur ET le pivot
-- de l'idempotence (unique). `ref_externe` reste la référence de l'AGRÉGATEUR (distincte).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pays      TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operateur TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS msisdn    TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS expire_le TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS maj_le    TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_key ON transactions (reference);
-- Garde double-recharge + historique : une transaction en cours par utilisateur.
CREATE INDEX IF NOT EXISTS transactions_user_statut_idx ON transactions (user_id, statut);

-- CONFIRMATION ATOMIQUE ET IDEMPOTENTE. Le crédit est posé une seule fois, même si
-- l'agrégateur confirme deux fois. La transition conditionnelle (statut in
-- initiated/pending) ne réussit qu'UNE fois ; les confirmations suivantes ne touchent
-- rien. Renvoie le nombre de crédits RÉELLEMENT posés (0 si déjà réglée/inconnue).
CREATE OR REPLACE FUNCTION confirmer_recharge(p_reference TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_id      BIGINT;
    v_user    BIGINT;
    v_credits INTEGER;
BEGIN
    UPDATE transactions
       SET statut = 'success', maj_le = now()
     WHERE reference = p_reference
       AND statut IN ('initiated', 'pending')
    RETURNING id, user_id, credits INTO v_id, v_user, v_credits;

    IF v_id IS NULL THEN
        RETURN 0; -- déjà réglée (double confirmation) ou référence inconnue : aucun crédit
    END IF;

    -- Crédit posé UNE fois : le grand livre est la source de vérité, le solde suit.
    INSERT INTO credit_ledger (user_id, delta, motif, transaction_id)
        VALUES (v_user, v_credits, 'recharge', v_id);
    UPDATE users SET credits = credits + v_credits WHERE id = v_user;
    RETURN v_credits;
END;
$$ LANGUAGE plpgsql;
