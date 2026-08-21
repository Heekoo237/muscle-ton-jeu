-- 0024 — tickets.supprime_le. Suppression d'une analyse par l'utilisateur, par
-- ANONYMISATION SUR PLACE (jamais un hard-delete de la ligne).
--
-- Pourquoi anonymiser plutôt que supprimer. L'historique PUBLIC s'alimente des tickets
-- réglés, de façon totalement anonyme (aucun user_id lu). Supprimer la ligne effacerait
-- notre preuve ; un simple masquage qui GARDE user_id ne serait pas un vrai effacement
-- (la ligne resterait rattachable à la personne — art. 17 RGPD). La suppression fait
-- donc trois choses, dans le store (supprimerTicket) :
--   1) user_id → NULL       (le lien personnel est ROMPU : effacement réel, pas masquage)
--   2) purge de la capture   (ticket_images + objets du bucket : seule vraie donnée perso)
--   3) supprime_le = now()   (marqueur d'AUDIT : trace qu'un effacement a bien eu lieu)
-- Les faits de règlement ANONYMES (sélections, verdicts, cotes transcrites) restent, et
-- continuent d'alimenter l'historique public et les agrégats — qui ne lisent jamais
-- l'utilisateur. Les crédits consommés ne sont JAMAIS remboursés (geste d'affichage).
--
-- La ligne disparaît de l'historique PRIVÉ sans nouvelle condition : listAnalysedTickets
-- filtre user_id = moi, or il est désormais NULL. `supprime_le` est un marqueur, pas un
-- filtre — mais il est écrit par le code, donc inscrit au manifeste (contrat code↔base).

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS supprime_le TIMESTAMPTZ;

-- ROLLBACK :
--   ALTER TABLE tickets DROP COLUMN IF EXISTS supprime_le;
