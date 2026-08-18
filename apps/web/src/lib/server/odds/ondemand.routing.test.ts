import { describe, it, expect } from 'vitest';
import { besoinDe } from './ondemand';
import { COVERED_MARKETS } from '$lib/types';

/**
 * Ciblage PAR MARCHÉ JOUÉ. `besoinDe` décide QUEL appel sert un pari :
 *  - 1X2 / double chance / ±2,5 → appel LIGUE (2 crédits) ;
 *  - BTTS / ±1,5 / ±3,5 → appel PAR ÉVÉNEMENT.
 * C'est ce qui garantit qu'un « Boca gagne » (1X2) ne déclenche JAMAIS l'appel par
 * événement pour des plus/moins que le joueur n'a pas joués.
 */
describe('besoinDe — pilotage de l’appel par le marché réellement joué', () => {
	it('1X2 et double chance → appel ligue', () => {
		for (const m of ['WIN_HOME', 'DRAW', 'WIN_AWAY', 'DC_HOME_DRAW', 'DC_DRAW_AWAY', 'DC_HOME_AWAY'] as const)
			expect(besoinDe(m)).toBe('league');
	});

	it('plus/moins 2,5 → appel ligue (groupé avec le 1X2, 2 crédits)', () => {
		expect(besoinDe('OVER_2_5')).toBe('league');
		expect(besoinDe('UNDER_2_5')).toBe('league');
	});

	it('BTTS et plus/moins 1,5 / 3,5 → appel par événement', () => {
		for (const m of ['BTTS_YES', 'BTTS_NO', 'OVER_1_5', 'UNDER_1_5', 'OVER_3_5', 'UNDER_3_5'] as const)
			expect(besoinDe(m)).toBe('event');
	});

	it('« Boca gagne » (WIN_HOME) ne route PAS vers l’événement', () => {
		expect(besoinDe('WIN_HOME')).not.toBe('event');
	});

	it('tout marché couvert a une route (aucun trou de ciblage)', () => {
		for (const m of COVERED_MARKETS) expect(besoinDe(m)).not.toBeNull();
	});
});
