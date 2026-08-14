import { describe, it, expect } from 'vitest';
import { buildReinforced, isAnalysable } from './ticket';
import type { Selection } from '$lib/types';

function sel(over: Partial<Selection> & Pick<Selection, 'ordre'>): Selection {
	return {
		texteBrut: `m${over.ordre}`,
		fixtureId: over.ordre,
		matchLabel: `Home${over.ordre} – Away${over.ordre}`,
		marche: 'WIN_HOME',
		etatResolution: 'certain',
		coteSaisie: 1.8,
		probabilite: 0.8,
		seuilFragile: 0.5,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: 'Home gagne',
		...over
	};
}

/** Une ligne « non couverte » telle que produite par l'action nonCouvert. */
function nonCouvert(ordre: number): Selection {
	return sel({
		ordre,
		marche: null,
		etatResolution: 'inconnu',
		raison: 'non_couvert',
		probabilite: null,
		seuilFragile: null,
		libelleFr: ''
	});
}

describe('marché non couvert — jamais analysé, jamais retiré, jamais facturé', () => {
	it('une ligne non couverte n’est pas analysable', () => {
		expect(isAnalysable(nonCouvert(1))).toBe(false);
	});

	it('elle reste dans le ticket et n’est jamais retirée du renforcé', () => {
		// 4 solides + 1 faible (retirée) + 1 non couverte. Il y a de la place pour
		// retirer : on vérifie que c'est la FAIBLE qui saute, pas la non couverte.
		const selections = [
			sel({ ordre: 1 }),
			sel({ ordre: 2 }),
			sel({ ordre: 3 }),
			sel({ ordre: 4 }),
			sel({ ordre: 5, probabilite: 0.3, seuilFragile: 0.9 }), // faible → retirée
			nonCouvert(6)
		];
		const r = buildReinforced(selections);

		const nc = r.selections.find((s) => s.ordre === 6)!;
		expect(nc.retireeDuRenforce).toBe(false); // jamais retirée
		expect(r.selections.some((s) => s.ordre === 6)).toBe(true); // reste dans le ticket
		expect(r.selections.find((s) => s.ordre === 5)?.retireeDuRenforce).toBe(true); // la faible saute
	});

	it('elle ne compte pas dans les sélections analysables (donc non facturée)', () => {
		const selections = [sel({ ordre: 1 }), sel({ ordre: 2 }), nonCouvert(3)];
		const analysables = selections.filter(isAnalysable).length;
		expect(analysables).toBe(2); // la non couverte est exclue du décompte facturable
	});
});
