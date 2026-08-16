import { describe, it, expect } from 'vitest';
import { regimeOf, aDesFaits } from './regime';
import { badgeVisible } from './markets-meta';
import { buildReinforced } from './ticket';
import { FakeWriting } from '$lib/server/services/writing/fake';
import type { WritingInput } from '$lib/server/services/writing';
import type { PredictionSource, Selection } from '$lib/types';

function mk(ordre: number, source: PredictionSource, prob: number): Selection {
	return {
		ordre,
		texteBrut: '',
		fixtureId: ordre,
		matchLabel: 'A – B',
		marche: 'WIN_HOME',
		etatResolution: 'certain',
		coteSaisie: null,
		probabilite: prob,
		seuilFragile: 0.5,
		source,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: 'A gagne'
	};
}

describe('regimeOf — la source décide le régime', () => {
	it('sources backtestées → mesure (on a mesuré, on a un historique)', () => {
		for (const s of ['odds', 'model', 'repli', 'model_marge_excessive'] as const) {
			expect(regimeOf(s)).toBe('mesure');
			expect(aDesFaits(s)).toBe(true);
		}
	});

	it('cote seule ET cote dérivée → cote (aucune mesure, aucun historique)', () => {
		expect(regimeOf('cote_seule')).toBe('cote');
		expect(regimeOf('cote_derivee')).toBe('cote');
		expect(aDesFaits('cote_seule')).toBe(false);
		expect(aDesFaits('cote_derivee')).toBe(false);
	});

	it('source absente → cote (défaut prudent : jamais « mesure » par erreur)', () => {
		expect(regimeOf(null)).toBe('cote');
		expect(regimeOf(undefined)).toBe('cote');
	});
});

describe('mention neutre double chance — indépendante du régime (précision 3.2)', () => {
	it('le badge de la double chance est OFF, quel que soit le régime', () => {
		// La visibilité du badge est PAR MARCHÉ, jamais par régime : une double chance
		// DÉRIVÉE d'une cote n'est pas plus prédictible qu'une double chance modélisée.
		// La mention neutre « la moins solide » s'applique donc dans les deux régimes.
		for (const m of ['DC_HOME_DRAW', 'DC_DRAW_AWAY', 'DC_HOME_AWAY'] as const) {
			expect(badgeVisible(m)).toBe(false);
		}
	});
});

describe('rédacteur en régime cote — aveu honnête, aucun fait inventé (précision 3.3)', () => {
	it('sans fait, tombe sur « c’est la cote », jamais un fait statistique', async () => {
		// En régime cote, l'app ne fournit AUCUN fait (faits: []). Le rédacteur ne doit
		// pas meubler : il avoue que c'est la cote qui rend la sélection fragile.
		const input: WritingInput = {
			probaTotalePct: 5,
			probaRenforceePct: 20,
			nbRetirees: 1,
			nbMatchs: 5,
			nbFragiles: 1,
			rienARetirer: false,
			retraits: [
				{
					ordre: 3,
					libelleFr: 'Grenoble – Metz — Metz gagne',
					avecBadge: true,
					chanceSur: 3,
					chanceSurMot: 'une chance sur trois',
					cote: null,
					faits: []
				}
			]
		};
		const out = await new FakeWriting().writeAnalysis(input);
		const texte = out.parSelection[0].texte;
		expect(texte.toLowerCase()).toContain('cote');
		// Aucun fait descriptif (forme, buts, confrontations) ne doit apparaître.
		expect(texte).not.toMatch(/victoire|perdu|encaisse|marque|souvent/i);
	});
});

describe('cote seule — jamais de badge rouge, mais bien retirable (précision non mesurée)', () => {
	it('WIN_HOME sous le seuil en cote seule → pas de badge, mais retirée (mention neutre)', () => {
		const input = [
			mk(1, 'cote_seule', 0.4), // sous 0,5 → candidate au retrait, SANS badge
			mk(2, 'model', 0.8),
			mk(3, 'model', 0.8),
			mk(4, 'model', 0.8),
			mk(5, 'model', 0.8)
		];
		const r = buildReinforced(input);
		const s1 = r.selections.find((s) => s.ordre === 1)!;
		expect(s1.fragile).toBe(false); // jamais de badge rouge en cote seule
		expect(s1.retireeDuRenforce).toBe(true); // mais bien retirée
	});

	it('même proba, régime mesure (odds) → badge rouge (contraste)', () => {
		const input = [
			mk(1, 'odds', 0.4),
			mk(2, 'model', 0.8),
			mk(3, 'model', 0.8),
			mk(4, 'model', 0.8),
			mk(5, 'model', 0.8)
		];
		const r = buildReinforced(input);
		expect(r.selections.find((s) => s.ordre === 1)!.fragile).toBe(true);
	});
});
