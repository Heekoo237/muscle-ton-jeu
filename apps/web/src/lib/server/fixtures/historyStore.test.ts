import { describe, it, expect } from 'vitest';
import { settleMarket } from './historyStore';

/**
 * Règlement déterministe d'un marché contre un score final. Aucun nombre ne
 * sort d'un LLM : l'issue passé/tombé est un calcul (CLAUDE.md, règle d'or n°1).
 */
describe('settleMarket', () => {
	it('règle le résultat sec (1X2)', () => {
		expect(settleMarket('WIN_HOME', 2, 0)).toBe(true);
		expect(settleMarket('WIN_HOME', 1, 1)).toBe(false);
		expect(settleMarket('DRAW', 1, 1)).toBe(true);
		expect(settleMarket('DRAW', 2, 1)).toBe(false);
		expect(settleMarket('WIN_AWAY', 0, 3)).toBe(true);
		expect(settleMarket('WIN_AWAY', 1, 1)).toBe(false);
	});

	it('règle la double chance', () => {
		expect(settleMarket('DC_HOME_DRAW', 1, 1)).toBe(true);
		expect(settleMarket('DC_HOME_DRAW', 0, 1)).toBe(false);
		expect(settleMarket('DC_DRAW_AWAY', 0, 0)).toBe(true);
		expect(settleMarket('DC_DRAW_AWAY', 2, 1)).toBe(false);
		expect(settleMarket('DC_HOME_AWAY', 2, 1)).toBe(true);
		expect(settleMarket('DC_HOME_AWAY', 1, 1)).toBe(false);
	});

	it('règle les plus/moins de buts', () => {
		expect(settleMarket('OVER_1_5', 1, 1)).toBe(true); // total 2
		expect(settleMarket('OVER_1_5', 1, 0)).toBe(false); // total 1
		expect(settleMarket('UNDER_1_5', 1, 0)).toBe(true);
		expect(settleMarket('OVER_2_5', 2, 1)).toBe(true); // total 3
		expect(settleMarket('UNDER_2_5', 1, 1)).toBe(true); // total 2
		expect(settleMarket('OVER_3_5', 2, 2)).toBe(true); // total 4
		expect(settleMarket('UNDER_3_5', 2, 1)).toBe(true); // total 3
	});

	it('règle les deux équipes marquent', () => {
		expect(settleMarket('BTTS_YES', 1, 2)).toBe(true);
		expect(settleMarket('BTTS_YES', 1, 0)).toBe(false);
		expect(settleMarket('BTTS_NO', 2, 0)).toBe(true);
		expect(settleMarket('BTTS_NO', 1, 1)).toBe(false);
	});
});
