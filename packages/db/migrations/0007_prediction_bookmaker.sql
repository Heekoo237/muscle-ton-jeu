-- =========================================================================
-- 0007 — Traçabilité de la SOURCE des probabilités « cote ». Idempotent.
--
-- Le dévigage a été calibré au backtest sur Pinnacle (marge ~2,84 %). Sur les
-- ligues où Pinnacle est absent (Grèce, Écosse…), un autre bookmaker sert, avec
-- une marge plus élevée. On enregistre QUEL bookmaker a fourni chaque probabilité
-- « cote » (pas seulement « odds »), pour pouvoir savoir a posteriori d'où vient
-- un chiffre. NULL pour les probabilités « model » (aucune cote).
-- =========================================================================

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS bookmaker TEXT;
