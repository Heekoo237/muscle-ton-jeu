-- =========================================================================
-- 0003 — Empreintes d'appareil ayant consommé le ticket offert (session auth).
-- Idempotent : peut être rejoué sans risque.
--
-- Marqueur INDICATIF de la gratuité du premier ticket, jamais une barrière dure.
-- Aucune adresse IP n'est stockée (des milliers d'utilisateurs partagent l'IP
-- sortante des opérateurs mobiles — un blocage par IP couperait des clients
-- légitimes en masse).
-- =========================================================================

CREATE TABLE IF NOT EXISTS offered_devices (
  fingerprint TEXT PRIMARY KEY,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE offered_devices ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seul le serveur (service_role) lit/écrit, comme les autres tables.
