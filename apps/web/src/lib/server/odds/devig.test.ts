import { describe, it, expect } from 'vitest';
import { devigPower, devigMarches } from './devig';

/**
 * TEST DORÉ — vecteurs générés depuis la VRAIE fonction Python du collecteur
 * (`mtj_model.backtest.closing_odds.devig_power`). Le port TS doit reproduire sa
 * sortie octet pour octet (à 1e-6). C'est ce qui remplace « la même fonction » :
 * une divergence VÉRIFIÉE impossible, pas seulement promise.
 */
const GOLDEN: Record<string, { odds: number[]; probs: number[] }> = {
	'1x2_a': { odds: [2.1, 3.4, 3.6], probs: [0.4601744579, 0.2779799641, 0.2618455781] },
	'1x2_fav': { odds: [1.5, 4.2, 6.5], probs: [0.6485512698, 0.2159754403, 0.1354732899] },
	'1x2_serre': { odds: [2.55, 3.25, 2.8], probs: [0.3730373922, 0.2889244695, 0.3380381384] },
	ou25: { odds: [1.9, 1.98], probs: [0.510790064, 0.489209936] },
	ou15: { odds: [1.28, 3.8], probs: [0.7650443709, 0.2349556291] },
	ou35: { odds: [2.65, 1.5], probs: [0.3521991837, 0.6478008163] },
	btts: { odds: [1.72, 2.1], probs: [0.5541130554, 0.4458869446] },
	deuxway_marge_faible: { odds: [1.95, 1.95], probs: [0.5, 0.5] }
};

describe('devigPower — port TS pinné sur la fonction Python (test doré)', () => {
	for (const [nom, { odds, probs }] of Object.entries(GOLDEN)) {
		it(`${nom} reproduit la sortie Python`, () => {
			const got = devigPower(odds);
			expect(got.length).toBe(probs.length);
			got.forEach((p, i) => expect(p).toBeCloseTo(probs[i], 6));
			// Toujours normalisé : Σ = 1.
			expect(got.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
		});
	}
});

describe('devigMarches — groupes, validité, double chance dérivée', () => {
	it('1X2 + O/U 2,5 + BTTS + dérive la double chance', () => {
		const out = devigMarches({
			WIN_HOME: 2.1,
			DRAW: 3.4,
			WIN_AWAY: 3.6,
			OVER_2_5: 1.9,
			UNDER_2_5: 1.98,
			BTTS_YES: 1.72,
			BTTS_NO: 2.1
		});
		const par = new Map(out.map((o) => [o.marche, o]));
		expect(par.get('WIN_HOME')!.probabilite).toBeCloseTo(0.4601744579, 6);
		expect(par.get('BTTS_YES')!.probabilite).toBeCloseTo(0.5541130554, 6);
		// Double chance = somme des deux issues 1X2, source cote_derivee.
		expect(par.get('DC_HOME_DRAW')!.probabilite).toBeCloseTo(0.4601744579 + 0.2779799641, 6);
		expect(par.get('DC_HOME_DRAW')!.source).toBe('cote_derivee');
		expect(par.get('WIN_HOME')!.source).toBe('cote_seule');
	});

	it('groupe incomplet ou aberrant → aucune probabilité (jamais deviné)', () => {
		// 1X2 avec une cote manquante → pas de 1X2, donc pas de double chance non plus.
		const out = devigMarches({ WIN_HOME: 2.1, DRAW: 3.4, OVER_2_5: 1.9, UNDER_2_5: 1.98 });
		const marches = new Set(out.map((o) => o.marche));
		expect(marches.has('WIN_HOME')).toBe(false);
		expect(marches.has('DC_HOME_DRAW')).toBe(false);
		expect(marches.has('OVER_2_5')).toBe(true); // le groupe O/U 2,5, lui, est complet
	});

	it('marge négative (cote ≤ 1 ou somme implicite < 1) → groupe rejeté', () => {
		const out = devigMarches({ OVER_1_5: 1.0, UNDER_1_5: 3.8 }); // cote = 1 → rejet
		expect(out.length).toBe(0);
	});
});
