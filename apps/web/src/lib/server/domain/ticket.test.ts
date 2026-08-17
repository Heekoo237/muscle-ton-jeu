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

describe('buildReinforced — règle d’or n°3 (retrait uniquement, plancher 1)', () => {
	it('le plancher est à 1', () => {
		expect(REINFORCED_FLOOR).toBe(1);
	});

	it('retire les sélections fragiles et améliore la probabilité', () => {
		const s = [sel(1, 0.8), sel(2, 0.75), sel(3, 0.7), sel(4, 0.72), sel(5, 0.3)];
		const r = buildReinforced(s);
		expect(r.retirees).toEqual([5]); // la seule sous 0,55
		expect(r.probaRenforcee).toBeGreaterThan(r.probaTotale);
		expect(r.rienARetirer).toBe(false);
	});

	it('RÉGRESSION : ticket de 4, une fragile → elle EST retirée (plus le plancher 4)', () => {
		// Le bug signalé : 4 matchs, 1 fragile, l’ancien plancher de 4 laissait tout
		// intact. Désormais on la barre et le renforcé descend à 3 lignes.
		const s = [sel(1, 0.8), sel(2, 0.75), sel(3, 0.7), sel(4, 0.3)];
		const r = buildReinforced(s);
		expect(r.retirees).toEqual([4]);
		expect(r.rienARetirer).toBe(false);
		expect(r.toutesFragiles).toBe(false);
		const gardees = r.selections.filter((x) => !x.retireeDuRenforce && x.marche).length;
		expect(gardees).toBe(3);
	});

	it('2 sélections, 1 fragile → renforcé à 1 seule ligne', () => {
		const r = buildReinforced([sel(1, 0.8), sel(2, 0.3)]);
		expect(r.retirees).toEqual([2]);
		const gardees = r.selections.filter((x) => !x.retireeDuRenforce).length;
		expect(gardees).toBe(1);
	});

	it('garde au moins une ligne : 5 sélections, 4 fragiles → il en reste 1', () => {
		const s = [sel(1, 0.9), sel(2, 0.3), sel(3, 0.2), sel(4, 0.25), sel(5, 0.35)];
		const r = buildReinforced(s);
		const gardees = r.selections.filter((x) => !x.retireeDuRenforce).length;
		expect(gardees).toBe(1); // la seule solide (0,9) reste
		expect(r.retirees).toEqual([2, 3, 4, 5]); // les quatre fragiles partent
	});

	it('« rien à retirer » quand aucune sélection n’est fragile', () => {
		const s = [sel(1, 0.8), sel(2, 0.75), sel(3, 0.7), sel(4, 0.72)];
		const r = buildReinforced(s);
		expect(r.rienARetirer).toBe(true);
		expect(r.retirees).toEqual([]);
		// Cas (b) : rien de fragile → ce n'est PAS « toutes fragiles ».
		expect(r.toutesFragiles).toBe(false);
	});

	it('(c) une SEULE ligne, fragile → toutes fragiles : rien retiré, jamais « tient debout »', () => {
		// On ne vide jamais le ticket : la seule ligne, même fragile, reste.
		const r = buildReinforced([sel(1, 0.11)]);
		expect(r.rienARetirer).toBe(true);
		expect(r.retirees).toEqual([]);
		expect(r.toutesFragiles).toBe(true);
	});

	it('(c) TOUTES fragiles (2-3 lignes) → on ne retire rien, on garde tout', () => {
		const r = buildReinforced([sel(1, 0.11), sel(2, 0.2), sel(3, 0.25)]);
		expect(r.rienARetirer).toBe(true);
		expect(r.toutesFragiles).toBe(true);
		const gardees = r.selections.filter((x) => !x.retireeDuRenforce).length;
		expect(gardees).toBe(3); // aucune retirée : on ne vide pas
	});

	it('(a) un vrai retrait n’est jamais marqué « toutes fragiles »', () => {
		const r = buildReinforced([sel(1, 0.8), sel(2, 0.75), sel(3, 0.7), sel(4, 0.72), sel(5, 0.3)]);
		expect(r.rienARetirer).toBe(false);
		expect(r.toutesFragiles).toBe(false);
	});

	it('toutes fragiles, beaucoup de lignes → on garde tout (on ne vide jamais)', () => {
		const s = Array.from({ length: 6 }, (_, i) => sel(i + 1, 0.2));
		const r = buildReinforced(s);
		expect(r.toutesFragiles).toBe(true);
		expect(r.retirees).toEqual([]);
		const gardees = r.selections.filter((x) => !x.retireeDuRenforce).length;
		expect(gardees).toBe(6);
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
