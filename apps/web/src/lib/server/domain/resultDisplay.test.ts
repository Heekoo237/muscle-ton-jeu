import { describe, it, expect } from 'vitest';
import { multiplicateurRetrait, autresIssues, MAX_AUTRES_ISSUES } from './resultDisplay';
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

describe('autresIssues — on MONTRE ce qui est en base, jamais un calcul', () => {
	// Un match complet (modélisé) : 1X2 + double chance + totals en base.
	const complet = [
		p('WIN_HOME', 0.116),
		p('DRAW', 0.188),
		p('WIN_AWAY', 0.696),
		p('DC_HOME_DRAW', 0.304),
		p('DC_DRAW_AWAY', 0.884),
		p('DC_HOME_AWAY', 0.812),
		p('OVER_1_5', 0.77),
		p('OVER_2_5', 0.47),
		p('UNDER_2_5', 0.53),
		p('OVER_3_5', 0.24),
		p('UNDER_3_5', 0.76),
		p('UNDER_1_5', 0.23)
	];

	it('1X2 joué → les deux autres 1X2 (proba desc) + la double chance la plus haute', () => {
		const out = autresIssues('WIN_HOME', complet);
		expect(out.map((i) => i.marche)).toEqual(['WIN_AWAY', 'DRAW', 'DC_DRAW_AWAY']);
		expect(out.length).toBe(3);
	});

	it('double chance jouée → les trois issues 1X2 (proba desc), pas d’autre DC', () => {
		const out = autresIssues('DC_HOME_DRAW', complet);
		expect(out.map((i) => i.marche)).toEqual(['WIN_AWAY', 'DRAW', 'WIN_HOME']);
	});

	it('plus/moins joué → complément (même seuil) puis même direction, seuil croissant', () => {
		const out = autresIssues('OVER_2_5', complet);
		expect(out.map((i) => i.marche)).toEqual(['UNDER_2_5', 'OVER_1_5', 'OVER_3_5']);
	});

	it('cote seule (seul le 2,5 en base) → une seule autre issue, jamais inventée', () => {
		const coteSeule = [p('OVER_2_5', 0.44), p('UNDER_2_5', 0.56)];
		expect(autresIssues('OVER_2_5', coteSeule).map((i) => i.marche)).toEqual(['UNDER_2_5']);
	});

	it('cote seule 1X2 (1X2 + DC dérivée) → les autres 1X2 + la DC la plus haute', () => {
		const coteSeule = [
			p('WIN_HOME', 0.12),
			p('DRAW', 0.25),
			p('WIN_AWAY', 0.63),
			p('DC_HOME_DRAW', 0.37),
			p('DC_DRAW_AWAY', 0.88),
			p('DC_HOME_AWAY', 0.75)
		];
		expect(autresIssues('DRAW', coteSeule).map((i) => i.marche)).toEqual([
			'WIN_AWAY',
			'WIN_HOME',
			'DC_DRAW_AWAY'
		]);
	});

	it('jamais plus de trois lignes', () => {
		expect(autresIssues('WIN_HOME', complet).length).toBeLessThanOrEqual(MAX_AUTRES_ISSUES);
	});

	it('BTTS (suspendu, aucune proba) → aucune issue', () => {
		expect(autresIssues('BTTS_YES', complet)).toEqual([]);
	});

	it('déterministe : même entrée → même sortie', () => {
		const a = autresIssues('WIN_HOME', complet).map((i) => i.marche);
		const b = autresIssues('WIN_HOME', complet).map((i) => i.marche);
		expect(a).toEqual(b);
	});
});
