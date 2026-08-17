/**
 * offer.ts — L'offre d'analyses gratuites, à UN SEUL endroit.
 *
 * BÊTA : 7 analyses offertes par compte, pour laisser les testeurs voir plusieurs
 * cas. Après la bêta, on repasse `ANALYSES_OFFERTES` à 1 — SANS migration : le
 * plafond vit ici, la base ne stocke que le nombre CONSOMMÉ (users.analyses_offertes_utilisees),
 * donc « restantes = max(0, ANALYSES_OFFERTES − utilisees) » se recalcule tout seul.
 *
 * Module partagé (hors `/server`) : le serveur l'utilise pour la facturation, le
 * client pour les textes — le nombre affiché et le nombre facturé ne peuvent pas
 * diverger.
 */
export const ANALYSES_OFFERTES = 7;

/** Restantes pour un compte, bornées à [0, plafond]. */
export function analysesOffertesRestantes(utilisees: number): number {
	return Math.max(0, ANALYSES_OFFERTES - utilisees);
}

/** « 1 analyse offerte » / « 7 analyses offertes » — accord au singulier pour 0 et 1. */
export function libelleOffertes(n: number): string {
	return n <= 1 ? `${n} analyse offerte` : `${n} analyses offertes`;
}
