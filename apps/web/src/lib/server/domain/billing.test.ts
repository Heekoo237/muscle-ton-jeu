import { describe, it, expect } from 'vitest';
import { computeCharge, featuredPack } from './billing';

describe('computeCharge — gratuités et paliers (PRD §8)', () => {
	// L'analyse OFFERTE n'est PLUS dans computeCharge : elle est appliquée en dernier
	// recours par l'appelant (résultat), après consommation atomique du compteur. Ici
	// on teste l'ordre des gratuités PERMANENTES et le cas facturé.

	it('ticket entièrement solide : gratuit', () => {
		const c = computeCharge({ nbAnalysables: 9, rienARetirer: true });
		expect(c).toMatchObject({ gratuit: true, raison: 'tout_solide' });
	});

	it('toutes fragiles (≥ 3 analysables) : FACTURÉ, jamais « tout solide »', () => {
		// Rien n'est retiré, mais on a rendu un vrai service (« tout ton ticket est
		// trop juste ») → on facture, contrairement au cas « tout solide ».
		const c = computeCharge({ nbAnalysables: 4, rienARetirer: true, toutesFragiles: true });
		expect(c.gratuit).toBe(false);
		expect(c.raison).toBeUndefined();
		expect(c.credits).toBe(1);
	});

	it('toutes fragiles mais < 3 analysables : gratuit (moins_de_3 prime)', () => {
		const c = computeCharge({ nbAnalysables: 2, rienARetirer: true, toutesFragiles: true });
		expect(c).toMatchObject({ gratuit: true, raison: 'moins_de_3' });
	});

	it('moins de 3 sélections analysables : gratuit', () => {
		const c = computeCharge({ nbAnalysables: 2, rienARetirer: false });
		expect(c).toMatchObject({ gratuit: true, raison: 'moins_de_3' });
	});

	it('même ticket sous 24 h : gratuit', () => {
		const c = computeCharge({ nbAnalysables: 9, rienARetirer: false, dejaAnalyseSous24h: true });
		expect(c).toMatchObject({ gratuit: true, raison: 'meme_ticket_24h' });
	});

	it('ticket substantiel facturé : appelant pourra y appliquer une offerte', () => {
		// computeCharge renvoie « facturé » : c'est LÀ (et seulement là) que l'appelant
		// tente l'offerte. Jamais une offerte gaspillée sur un ticket déjà gratuit.
		const c = computeCharge({ nbAnalysables: 9, rienARetirer: false });
		expect(c).toMatchObject({ gratuit: false, credits: 2, bloque: false });
	});

	it('au-delà de 20 : blocage dur', () => {
		const c = computeCharge({ nbAnalysables: 21, rienARetirer: false });
		expect(c).toMatchObject({ bloque: true, credits: null });
	});

	it('données incomplètes (ligne « pas encore de données ») : gratuit, prime sur le facturé', () => {
		// Ticket qui SERAIT facturé (≥ 3 analysables, non tout-solide) mais avec un match
		// résolu sans prédiction → service non rendu, jamais facturé.
		const c = computeCharge({ nbAnalysables: 9, rienARetirer: false, donneesIncompletes: true });
		expect(c).toMatchObject({ gratuit: true, raison: 'donnees_incompletes', credits: 0 });
	});

	it('données incomplètes mais > 20 : le blocage dur prime (jamais analysé)', () => {
		const c = computeCharge({ nbAnalysables: 21, rienARetirer: false, donneesIncompletes: true });
		expect(c).toMatchObject({ bloque: true, credits: null });
	});
});

describe('featuredPack — met en avant le pack qui couvre le ticket', () => {
	it('1 crédit nécessaire → pack Ticket', () => {
		expect(featuredPack(1)).toBe('ticket');
	});
	it('au-delà des packs à crédits → week-end illimité', () => {
		expect(featuredPack(30)).toBe('weekend');
	});
});
