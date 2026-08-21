import { describe, it, expect } from 'vitest';
import {
	buildReinforced,
	creditCost,
	productProbability,
	hasSameFixtureConflict,
	isAnalysable,
	estSerree,
	estSolide,
	SERRE_MARGE,
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

describe('petits tickets sous le plancher 1 — le renforcé garde du sens', () => {
	// La règle « strictement plus de la moitié retirée » telle que l'écran la calcule.
	const majoriteRetiree = (nbRetirees: number, nbAnalysables: number) =>
		nbRetirees * 2 > nbAnalysables;

	it('(a) 2 matchs, 1 fragile → renforcé à 1 ligne, sa proba a du sens', () => {
		const r = buildReinforced([sel(1, 0.8), sel(2, 0.3)]);
		const gardees = r.selections.filter((x) => isAnalysable(x));
		expect(gardees.filter((x) => !x.retireeDuRenforce)).toHaveLength(1);
		// La proba du renforcé = celle de la seule ligne gardée (0,8) : un nombre réel,
		// pas un « combiné » d'une seule ligne qui n'aurait pas de sens.
		expect(r.probaRenforcee).toBeCloseTo(0.8);
		expect(r.probaRenforcee).toBeGreaterThan(r.probaTotale);
		// 1 retiré sur 2 = exactement la moitié → PAS d'avertissement « très différent ».
		expect(majoriteRetiree(r.retirees.length, 2)).toBe(false);
	});

	it('(b) 3 matchs, 2 fragiles → renforcé à 1 ligne, avertissement « majorité retirée »', () => {
		const r = buildReinforced([sel(1, 0.8), sel(2, 0.3), sel(3, 0.35)]);
		expect(r.retirees).toEqual([2, 3]);
		expect(r.selections.filter((x) => !x.retireeDuRenforce && x.marche)).toHaveLength(1);
		expect(r.probaRenforcee).toBeCloseTo(0.8);
		// 2 retirés sur 3 → strictement plus de la moitié : on prévient.
		expect(majoriteRetiree(r.retirees.length, 3)).toBe(true);
	});
});

describe('badge « fragile » vs mention neutre (seuil PAR MARCHÉ)', () => {
	it('retire « l\'un ou l\'autre » (12) SANS badge rouge (gain +2,6 < 5 → mention neutre)', () => {
		const s = [
			sel(1, 0.9),
			sel(2, 0.85),
			sel(3, 0.8),
			sel(4, 0.78),
			sel(5, 0.6, 5, 'DC_HOME_AWAY', 0.73) // sous 0,73 → retirable, mais gain trop faible
		];
		const r = buildReinforced(s);
		expect(r.retirees).toEqual([5]); // classement interne : elle part
		const removed = r.selections.find((x) => x.ordre === 5)!;
		expect(removed.retireeDuRenforce).toBe(true);
		expect(removed.fragile).toBe(false); // 12 : jamais de badge (gain sous le plancher)
	});

	it('porte le badge « trop juste » sur un 1X2 sous son seuil (recalibré par issue, Direction 2)', () => {
		const s = [
			sel(1, 0.9),
			sel(2, 0.85),
			sel(3, 0.8),
			sel(4, 0.78),
			sel(5, 0.3, 5, 'WIN_HOME', 0.33) // sous 0,33 → badge de nouveau mérité (marque ~30 %)
		];
		const r = buildReinforced(s);
		const removed = r.selections.find((x) => x.ordre === 5)!;
		expect(r.retirees).toEqual([5]);
		expect(removed.fragile).toBe(true); // le badge 1X2 revient après recalibrage
	});

	it('porte le badge « trop juste » sur un plus/moins sous son seuil (gain ≥ 5, marquage ≤ 40 %)', () => {
		const s = [
			sel(1, 0.9),
			sel(2, 0.85),
			sel(3, 0.8),
			sel(4, 0.78),
			sel(5, 0.4, 5, 'OVER_2_5', 0.48) // sous 0,48 → badge visible (marché détecteur)
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

describe('estSerree / estSolide — « pas retiré » ≠ « solide » (marge mesurée 0,10)', () => {
	// sel() : seuil 0,55 par défaut. Serré = proba < 0,55 + 0,10 = 0,65 ; solide au-delà.
	it('la marge mesurée est 0,10', () => {
		expect(SERRE_MARGE).toBe(0.1);
	});

	it('une ligne juste au-dessus du seuil (+0,05) est SERRÉE, pas solide', () => {
		const s = sel(1, 0.6); // seuil 0,55 → écart +0,05
		expect(estSerree(s)).toBe(true);
		expect(estSolide(s)).toBe(false);
	});

	it('une ligne confortablement au-dessus (+0,15) est SOLIDE', () => {
		const s = sel(1, 0.7); // seuil 0,55 → écart +0,15
		expect(estSerree(s)).toBe(false);
		expect(estSolide(s)).toBe(true);
	});

	it('une ligne sous le seuil compte comme serrée (prudence), jamais solide', () => {
		const s = sel(1, 0.5); // sous 0,55
		expect(estSerree(s)).toBe(true);
		expect(estSolide(s)).toBe(false);
	});

	it('une ligne non analysable n’est ni serrée ni solide', () => {
		const s = { ...sel(1, 0.6), probabilite: null };
		expect(estSerree(s)).toBe(false);
		expect(estSolide(s)).toBe(false);
	});
});

describe('INVARIANTS de l’écran de résultat (ne doivent plus jamais tomber)', () => {
	it('quand une ligne est retirée, le renforcé a du contenu', () => {
		// Une ligne fragile (0,30 < seuil 0,55) parmi des solides → retrait effectif.
		const r = buildReinforced([sel(1, 0.8), sel(2, 0.8), sel(3, 0.3)]);
		expect(r.rienARetirer).toBe(false);
		expect(r.retirees.length).toBeGreaterThan(0);
		expect(r.selections.some((s) => s.retireeDuRenforce)).toBe(true);
	});

	it('quand rien n’est retiré mais une ligne est serrée, elle est détectable (on développe)', () => {
		// Toutes au-dessus du seuil (rien à retirer), mais une serrée (0,60 < 0,65).
		const r = buildReinforced([sel(1, 0.8), sel(2, 0.6)]);
		expect(r.rienARetirer).toBe(true);
		const gardeesSerrees = r.selections.filter((s) => !s.retireeDuRenforce && estSerree(s));
		expect(gardeesSerrees.length).toBe(1);
	});

	it('quand tout est solide, aucune serrée : l’écran dit « tient », sans en inventer', () => {
		const r = buildReinforced([sel(1, 0.8), sel(2, 0.75)]);
		expect(r.rienARetirer).toBe(true);
		const gardeesSerrees = r.selections.filter((s) => !s.retireeDuRenforce && estSerree(s));
		expect(gardeesSerrees.length).toBe(0);
	});
});
