-- =========================================================================
-- 0004 — Liens de partage courts (session partage). Idempotent.
--
-- Un code opaque par ticket. La page publique /p/<code> n'expose que l'image de
-- partage : aucune donnée de compte (ni prénom, ni avatar, ni email, ni
-- historique). Le code ne permet pas de remonter à l'utilisateur côté client.
-- =========================================================================

CREATE TABLE IF NOT EXISTS shares (
  code      TEXT PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  cree_le   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shares_ticket_idx ON shares (ticket_id);

ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seul le serveur (service_role) lit/écrit.
