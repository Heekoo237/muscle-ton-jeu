import { describe, it, expect } from 'vitest';
import {
	multiplicateurRetrait,
	autresIssues,
	autresIssuesParRetrait,
	MAX_AUTRES_ISSUES
} from './resultDisplay';
import type { Market } from '$lib/types';

describe('multiplicateurRetrait — effet du retrait, à côté du pourcentage', () => {
	it('« N fois plus de chances » dès ×2, arrondi lisible', () => {
		// 0,08 % → 2,1 % ≈ ×26 (exemple du brief).
		expect(multiplicateurRetrait(0.0008, 0.021, true)).toBe('26 fois plus de chances');
		expect(multiplicateurRetrait(0.1, 0.2, true)).toBe('2 fois plus de chances');
	});

	it('« un peu plus de chances » quand le ratio est entre 1 et 2', () => {
		expect(multiplicateurRetrait(0.1, 0.15, true)).toBe('un peu plus de chances');
	});

	it('RIEN sans retrait — aucun effet à montrer', () => {
		expect(multiplicateurRetrait(0.1, 0.2, false)).toBeNull();
	});

	it('RIEN si le retrait ne change RIEN au pourcentage affiché (arrondi = exactement 1)', () => {
		// Ratio brut > 1 mais invisible à l'affichage (1 décimale) → on ne prétend rien.
		expect(multiplicateurRetrait(0.101, 0.1013, true)).toBeNull();
		expect(multiplicateurRetrait(0.2, 0.2, true)).toBeNull();
	});

	it('jamais « 26,4 fois » : l’arrondi est entier', () => {
		expect(multiplicateurRetrait(0.01, 0.264, true)).toBe('26 fois plus de chances');
	});
});

function p(marche: Market, probabilite: number) {
	return { marche, probabilite };
}

describe('autresIssues — les paris les plus probables, curatés (hors DC, hors évidence)', () => {
	// Un match complet en base : 1X2 + double chance + plus/moins.
	const complet = [
		p('WIN_HOME', 0.116),
		p('DRAW', 0.188),
		p('WIN_AWAY', 0.696),
		p('DC_HOME_DRAW', 0.304),
		p('DC_DRAW_AWAY', 0.884),
		p('DC_HOME_AWAY', 0.812),
		p('OVER_1_5', 0.77), // évidence (> 72 %) → écarté
		p('OVER_2_5', 0.47),
		p('UNDER_2_5', 0.53),
		p('OVER_3_5', 0.24),
		p('UNDER_3_5', 0.76), // évidence → écarté
		p('UNDER_1_5', 0.23)
	];

	it('montre les DEUX plus probables, hors double chance et hors évidence', () => {
		// WIN_AWAY 0,696 puis UNDER_2_5 0,53. OVER_1_5 (0,77) et UNDER_3_5 (0,76) sont écartés.
		expect(autresIssues('WIN_HOME', complet).map((i) => i.marche)).toEqual(['WIN_AWAY', 'UNDER_2_5']);
	});

	it('JAMAIS de double chance, même la plus haute (le pari le moins parlant)', () => {
		const out = autresIssues('WIN_HOME', complet).map((i) => i.marche);
		expect(out.some((m) => m.startsWith('DC_'))).toBe(false);
	});

	it('écarte l’ÉVIDENCE (> 72 %) : un quasi-certain n’est jamais montré en orientation', () => {
		expect(autresIssues('WIN_HOME', complet).map((i) => i.marche)).not.toContain('OVER_1_5');
	});

	it('exclut le pari JOUÉ lui-même (il vient d’être retiré)', () => {
		expect(autresIssues('WIN_AWAY', complet).map((i) => i.marche)).not.toContain('WIN_AWAY');
	});

	it('jamais un pari ET son complément ensemble (redondant)', () => {
		const paire = [p('OVER_2_5', 0.6), p('UNDER_2_5', 0.4), p('WIN_HOME', 0.1)];
		expect(autresIssues('WIN_HOME', paire).map((i) => i.marche)).toEqual(['OVER_2_5']);
	});

	it('cote seule (seul le 2,5 en base) → une seule autre issue, jamais inventée', () => {
		const coteSeule = [p('OVER_2_5', 0.44), p('UNDER_2_5', 0.56)];
		expect(autresIssues('OVER_2_5', coteSeule).map((i) => i.marche)).toEqual(['UNDER_2_5']);
	});

	it('jamais plus de DEUX', () => {
		expect(MAX_AUTRES_ISSUES).toBe(2);
		expect(autresIssues('WIN_HOME', complet).length).toBeLessThanOrEqual(MAX_AUTRES_ISSUES);
	});

	it('rien d’éligible (que de la DC / que de l’évidence) → VIDE (le bloc ne s’affiche pas)', () => {
		const rienDeMontrable = [p('DC_HOME_DRAW', 0.8), p('OVER_1_5', 0.9)];
		expect(autresIssues('WIN_HOME', rienDeMontrable)).toEqual([]);
	});

	it('déterministe : même entrée → même sortie', () => {
		const a = autresIssues('WIN_HOME', complet).map((i) => i.marche);
		const b = autresIssues('WIN_HOME', complet).map((i) => i.marche);
		expect(a).toEqual(b);
	});
});

describe('INVARIANT — le bloc « ce que disent les chances » ne se vide pas en silence', () => {
	const preds = (m: [Market, number][]) => m.map(([marche, probabilite]) => ({ marche, probabilite }));
	const parFixture = new Map<number, { marche: Market; probabilite: number }[]>([
		[10, preds([['WIN_HOME', 0.55], ['DRAW', 0.25], ['WIN_AWAY', 0.2], ['DC_HOME_DRAW', 0.8]])]
	]);

	it('une ligne retirée dont le match a d’autres paris en base → du contenu (les 2 plus probables, hors DC)', () => {
		const map = autresIssuesParRetrait([{ ordre: 3, marche: 'WIN_AWAY', fixtureId: 10 }], parFixture);
		expect(map.get(3)?.length).toBeGreaterThan(0);
		expect(map.get(3)?.map((i) => i.marche)).toEqual(['WIN_HOME', 'DRAW']);
	});

	it('pas de contenu inventé quand le match n’a pas ses voisins en base', () => {
		const maigre = new Map<number, { marche: Market; probabilite: number }[]>([
			[10, preds([['WIN_AWAY', 0.2]])] // seul le pari joué est en base
		]);
		const map = autresIssuesParRetrait([{ ordre: 3, marche: 'WIN_AWAY', fixtureId: 10 }], maigre);
		expect(map.has(3)).toBe(false); // vide honnête, jamais un pari deviné
	});

	it('plusieurs retraits : chacun garde ses propres voisins', () => {
		const m = new Map<number, { marche: Market; probabilite: number }[]>([
			[10, preds([['WIN_HOME', 0.55], ['DRAW', 0.25], ['WIN_AWAY', 0.2]])],
			[11, preds([['OVER_2_5', 0.44], ['UNDER_2_5', 0.56]])]
		]);
		const map = autresIssuesParRetrait(
			[{ ordre: 1, marche: 'WIN_HOME', fixtureId: 10 }, { ordre: 2, marche: 'OVER_2_5', fixtureId: 11 }],
			m
		);
		expect(map.get(1)?.length).toBeGreaterThan(0);
		expect(map.get(2)?.map((i) => i.marche)).toEqual(['UNDER_2_5']);
	});
});
