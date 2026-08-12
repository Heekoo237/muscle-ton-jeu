import { describe, it, expect } from 'vitest';
import { computeCharge, featuredPack } from './billing';

describe('computeCharge — gratuités et paliers (PRD §8)', () => {
	it('premier ticket toujours gratuit', () => {
		const c = computeCharge({ nbAnalysables: 9, premierTicket: true, rienARetirer: false });
		expect(c).toMatchObject({ gratuit: true, raison: 'premier_ticket', credits: 0 });
	});

	it('ticket entièrement solide : gratuit', () => {
		const c = computeCharge({ nbAnalysables: 9, premierTicket: false, rienARetirer: true });
		expect(c).toMatchObject({ gratuit: true, raison: 'tout_solide' });
	});

	it('moins de 3 sélections analysables : gratuit', () => {
		const c = computeCharge({ nbAnalysables: 2, premierTicket: false, rienARetirer: false });
		expect(c).toMatchObject({ gratuit: true, raison: 'moins_de_3' });
	});

	it('même ticket sous 24 h : gratuit', () => {
		const c = computeCharge({
			nbAnalysables: 9,
			premierTicket: false,
			rienARetirer: false,
			dejaAnalyseSous24h: true
		});
		expect(c).toMatchObject({ gratuit: true, raison: 'meme_ticket_24h' });
	});

	it('cas facturé : applique le palier', () => {
		const c = computeCharge({ nbAnalysables: 9, premierTicket: false, rienARetirer: false });
		expect(c).toMatchObject({ gratuit: false, credits: 2, bloque: false });
	});

	it('au-delà de 20 : blocage dur', () => {
		const c = computeCharge({ nbAnalysables: 21, premierTicket: false, rienARetirer: false });
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
