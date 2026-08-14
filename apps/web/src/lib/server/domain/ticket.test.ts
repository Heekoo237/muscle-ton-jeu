import { describe, it, expect } from 'vitest';
import {
	buildReinforced,
	creditCost,
	productProbability,
	hasSameFixtureConflict,
	REINFORCED_FLOOR
} from './ticket';
import type { Selection } from '$lib/types';

/** Fabrique une sélection analysable minimale (seuil explicite pour le test). */
function sel(
	ordre: number,
	probabilite: number,
	fixtureId = ordre,
	marche: Selection['marche'] = 'WIN_HOME',
	seuilFragile = 0.55
): Selection {
	return {
		ordre,
		texteBrut: `sel ${ordre}`,
		fixtureId,
		matchLabel: `Match ${ordre}`,
		marche,
		etatResolution: 'certain',
		coteSaisie: null,
		probabilite,
		seuilFragile,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: `Match ${ordre}`
	};
}

describe('productProbability', () => {
	it('multiplie les probabilités des sélections analysables', () => {
		expect(productProbability([sel(1, 0.5), sel(2, 0.5)])).toBeCloseTo(0.25);
	});
});

describe('buildReinforced — règle d’or n°3 (retrait uniquement, plancher 4)', () => {
	it('retire les sélections fragiles et améliore la probabilité', () => {
		const s = [sel(1, 0.8), sel(2, 0.75), sel(3, 0.7), sel(4, 0.72), sel(5, 0.3)];
		const r = buildReinforced(s);
		expect(r.retirees).toEqual([5]); // la seule sous 0,55
		expect(r.probaRenforcee).toBeGreaterThan(r.probaTotale);
		expect(r.rienARetirer).toBe(false);
	});

	it('ne descend jamais sous 4 sélections, même si le seuil le justifierait', () => {
		// 5 sélections, 4 fragiles : on ne peut en retirer qu’une (plancher 4).
		const s = [sel(1, 0.9), sel(2, 0.3), sel(3, 0.2), sel(4, 0.25), sel(5, 0.35)];
		const r = buildReinforced(s);
		const gardees = r.selections.filter((x) => !x.retireeDuRenforce).length;
		expect(gardees).toBe(REINFORCED_FLOOR);
		expect(r.retirees).toEqual([3]); // la plus fragile d’abord (proba 0,2)
	});

	it('« rien à retirer » quand aucune sélection n’est fragile', () => {
		const s = [sel(1, 0.8), sel(2, 0.75), sel(3, 0.7), sel(4, 0.72)];
		const r = buildReinforced(s);
		expect(r.rienARetirer).toBe(true);
		expect(r.retirees).toEqual([]);
	});

	it('ne retire jamais sous le plancher même avec beaucoup de fragiles', () => {
		const s = Array.from({ length: 6 }, (_, i) => sel(i + 1, 0.2));
		const r = buildReinforced(s);
		const gardees = r.selections.filter((x) => !x.retireeDuRenforce).length;
		expect(gardees).toBe(REINFORCED_FLOOR);
	});
});

describe('badge « fragile » vs mention neutre (seuil PAR MARCHÉ)', () => {
	it('retire une double chance faible SANS badge rouge (mention neutre)', () => {
		const s = [
			sel(1, 0.9),
			sel(2, 0.85),
			sel(3, 0.8),
			sel(4, 0.78),
			sel(5, 0.6, 5, 'DC_HOME_DRAW', 0.74) // sous 0,74 → retirable, mais marché « sûr »
		];
		const r = buildReinforced(s);
		expect(r.retirees).toEqual([5]); // classement interne : elle part
		const removed = r.selections.find((x) => x.ordre === 5)!;
		expect(removed.retireeDuRenforce).toBe(true);
		expect(removed.fragile).toBe(false); // JAMAIS de badge rouge sur double chance
	});

	it('porte le badge rouge sur un 1X2 sous son seuil', () => {
		const s = [
			sel(1, 0.9),
			sel(2, 0.85),
			sel(3, 0.8),
			sel(4, 0.78),
			sel(5, 0.4, 5, 'WIN_HOME', 0.44) // sous 0,44 → badge visible
		];
		const r = buildReinforced(s);
		const removed = r.selections.find((x) => x.ordre === 5)!;
		expect(removed.fragile).toBe(true);
		expect(r.retirees).toEqual([5]);
	});
});

describe('hasSameFixtureConflict — deux sélections sur le même match', () => {
	it('détecte le conflit qui fausse le produit des probabilités', () => {
		expect(hasSameFixtureConflict([sel(1, 0.6, 100), sel(2, 0.7, 100)])).toBe(true);
		expect(hasSameFixtureConflict([sel(1, 0.6, 100), sel(2, 0.7, 101)])).toBe(false);
	});
});

describe('creditCost — paliers PRD §8.1', () => {
	it('applique les paliers et bloque au-delà de 20', () => {
		expect(creditCost(1)).toBe(0);
		expect(creditCost(6)).toBe(1);
		expect(creditCost(7)).toBe(2);
		expect(creditCost(12)).toBe(2);
		expect(creditCost(13)).toBe(3);
		expect(creditCost(20)).toBe(3);
		expect(creditCost(21)).toBeNull(); // blocage dur
	});
});
