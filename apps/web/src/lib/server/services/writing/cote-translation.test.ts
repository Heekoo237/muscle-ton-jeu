import { describe, it, expect } from 'vitest';
import { FakeWriting } from './fake';
import { allowedNumbersFor } from './allowed';
import { chanceSur, chanceSurMot } from './enrich';
import { checkGeneratedText, checkCausality } from '$lib/server/domain/guards';
import type { RetraitEnrichi, WritingInput } from './index';

function retrait(o: Partial<RetraitEnrichi> & Pick<RetraitEnrichi, 'ordre' | 'libelleFr'>): RetraitEnrichi {
	return { avecBadge: true, chanceSur: 2, chanceSurMot: 'une chance sur deux', cote: null, faits: [], ...o };
}
function input(retraits: RetraitEnrichi[]): WritingInput {
	return {
		probaTotalePct: 2.1,
		probaRenforceePct: 9.4,
		nbRetirees: retraits.length,
		nbMatchs: 7,
		nbFragiles: retraits.filter((r) => r.avecBadge).length,
		rienARetirer: false,
		retraits
	};
}
/** Retrait chiffré à partir d'une proba (comme le fait le serveur). */
function frag(ordre: number, libelleFr: string, proba: number, cote: number, faits: string[] = [], avecBadge = true) {
	return retrait({ ordre, libelleFr, avecBadge, cote, faits, chanceSur: chanceSur(proba), chanceSurMot: chanceSurMot(proba) });
}

const fake = new FakeWriting();
async function texteDe(inp: WritingInput, ordre: number): Promise<string> {
	const out = await fake.writeAnalysis(inp);
	return out.parSelection.find((p) => p.ordre === ordre)!.texte;
}

describe('traduction de la cote — deux nombres FOURNIS, aucun calcul', () => {
	it('cote seule (aucun fait) : la traduction PORTE l’explication', async () => {
		const inp = input([frag(1, 'Rio Ave – FC Porto — Rio Ave gagne', 0.116, 7.9)]);
		const t = await texteDe(inp, 1);
		expect(t).toContain('7,90'); // la cote LUE, telle quelle
		expect(t).toContain('une fois sur neuf'); // 1/0,116 ≈ 9, via notre proba (pas 1/cote)
		expect(t).not.toContain('rien de marquant'); // mieux que l'aveu creux
		// Garde-fou complet : nombres autorisés, vocabulaire, causalité.
		const g = checkGeneratedText(t, allowedNumbersFor(inp));
		expect(g.ok).toBe(true);
		expect(checkCausality(t).ok).toBe(true);
	});

	it('avec des faits : la traduction S’AJOUTE, les faits restent', async () => {
		const inp = input([
			frag(2, 'Napoli – Roma — Napoli gagne', 0.31, 3.2, ['Napoli a perdu deux fois à domicile.'])
		]);
		const t = await texteDe(inp, 2);
		expect(t).toContain('Napoli a perdu deux fois à domicile');
		expect(t).toContain('3,20');
		expect(t).toContain('une fois sur trois');
		expect(checkGeneratedText(t, allowedNumbersFor(inp)).ok).toBe(true);
	});

	it('UNE seule sélection porte la traduction : la plus risquée (proba la plus basse)', async () => {
		const inp = input([
			frag(1, 'A – B — A gagne', 0.116, 7.9), // la plus risquée → chanceSur 9
			frag(2, 'C – D — C gagne', 0.33, 3.0) // moins risquée
		]);
		const t1 = await texteDe(inp, 1);
		const t2 = await texteDe(inp, 2);
		expect(t1).toContain('7,90'); // traduite
		expect(t2).not.toContain('3,00'); // pas de cote ici : jamais répétitif
	});

	it('cote absente → aucune traduction, on n’invente rien', async () => {
		const inp = input([frag(1, 'A – B — A gagne', 0.2, 0)]);
		const sansCote = input([retrait({ ordre: 1, libelleFr: 'A – B — A gagne', chanceSur: chanceSur(0.2), chanceSurMot: chanceSurMot(0.2) })]);
		const t = await texteDe(sansCote, 1);
		expect(t).not.toMatch(/une fois sur/);
		void inp;
	});
});
