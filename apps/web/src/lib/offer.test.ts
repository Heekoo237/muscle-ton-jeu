import { describe, it, expect } from 'vitest';
import { ANALYSES_OFFERTES, analysesOffertesRestantes, libelleOffertes } from './offer';

describe('offre — restantes bornées et libellé accordé', () => {
	it('restantes = plafond − consommées, jamais négatif', () => {
		expect(analysesOffertesRestantes(0)).toBe(ANALYSES_OFFERTES);
		expect(analysesOffertesRestantes(3)).toBe(ANALYSES_OFFERTES - 3);
		// Un compte qui a consommé plus que le plafond actuel (retour à 1 après bêta) → 0.
		expect(analysesOffertesRestantes(ANALYSES_OFFERTES + 5)).toBe(0);
	});

	it('libellé accordé : singulier pour 0 et 1, pluriel au-delà', () => {
		expect(libelleOffertes(0)).toBe('0 analyse offerte');
		expect(libelleOffertes(1)).toBe('1 analyse offerte');
		expect(libelleOffertes(7)).toBe('7 analyses offertes');
	});
});
