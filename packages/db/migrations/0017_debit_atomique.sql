-- 0017 — I3 : débit de crédits ATOMIQUE. Fin du read-then-write sur users.credits
-- (userStore.record) + de la garde sur un solde de SESSION périmé. Une seule requête
-- décide et applique, en enforçant le solde AU NIVEAU BASE : deux affichages
-- concurrents ne peuvent plus payer deux analyses avec le même solde de départ.
--
-- Renvoie TRUE si débité, FALSE si solde insuffisant (l'appelant redirige vers recharge).
CREATE OR REPLACE FUNCTION debiter_credits(p_user BIGINT, p_cost INT, p_ticket BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_id BIGINT;
BEGIN
  UPDATE users
     SET credits = credits - p_cost
   WHERE id = p_user
     AND credits >= p_cost
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN false; -- solde insuffisant : rien débité
  END IF;
  -- Grand livre = source de vérité ; posé dans la MÊME transaction que le solde.
  INSERT INTO credit_ledger (user_id, delta, motif, ticket_id)
    VALUES (p_user, -p_cost, 'debit_analyse', p_ticket);
  RETURN true;
END;
$$ LANGUAGE plpgsql;
