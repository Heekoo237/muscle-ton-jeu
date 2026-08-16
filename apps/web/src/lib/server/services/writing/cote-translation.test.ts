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
	it('cote seule (aucun fait) : la traduction PORTE l’explication, avec « environ »', async () => {
		const inp = input([frag(1, 'Rio Ave – FC Porto — Rio Ave gagne', 0.116, 7.9)]);
		const t = await texteDe(inp, 1);
		expect(t).toContain('7,90'); // la cote LUE, telle quelle
		expect(t).toContain('environ une fois sur neuf'); // 1/0,116 ≈ 9, via notre proba (pas 1/cote)
		expect(t).not.toContain('rien de marquant'); // mieux que l'aveu creux
		// Garde-fou complet : nombres autorisés, vocabulaire, causalité.
		const g = checkGeneratedText(t, allowedNumbersFor(inp));
		expect(g.ok).toBe(true);
		expect(checkCausality(t).ok).toBe(true);
	});

	it('« environ » est présent : notre chiffre est une estimation, pas 1/cote', async () => {
		const inp = input([frag(1, 'Rio Ave – FC Porto — Rio Ave gagne', 0.116, 7.9)]);
		const t = await texteDe(inp, 1);
		expect(t).toMatch(/environ une fois sur/);
	});

	it('avec des faits : la traduction S’AJOUTE, les faits restent', async () => {
		const inp = input([
			frag(2, 'Napoli – Roma — Napoli gagne', 0.31, 3.2, ['Napoli a perdu deux fois à domicile.'])
		]);
		const t = await texteDe(inp, 2);
		expect(t).toContain('Napoli a perdu deux fois à domicile');
		expect(t).toContain('3,20');
		expect(t).toContain('environ une fois sur trois');
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

	it('cote absente (pari corrigé sur l’écran de validation) → aucune traduction', async () => {
		// À la correction, le serveur met coteSaisie à null (la cote lue ne colle plus au
		// nouveau marché). Ici cote null → pas de phrase : on n'affiche jamais une cote qui
		// ne correspond plus au pari.
		const sansCote = input([
			retrait({ ordre: 1, libelleFr: 'A – B — A ou match nul', chanceSur: chanceSur(0.2), chanceSurMot: chanceSurMot(0.2) })
		]);
		const t = await texteDe(sansCote, 1);
		expect(t).not.toMatch(/une fois sur/);
		expect(t).not.toMatch(/cote à/);
	});
});

describe('traduction de la cote — TOUS les marchés couverts', () => {
	// (libellé du pari, proba en base, cote lue, « une fois sur » attendu)
	const CAS: [string, number, number, string][] = [
		['Casa Pia – Benfica — Casa Pia gagne', 0.22, 4.5, 'cinq'], // victoire domicile
		['Famalicão – Maritimo — Match nul', 0.266, 3.45, 'quatre'], // NUL (cas réel du ticket)
		['Rio Ave – FC Porto — FC Porto gagne', 0.15, 6.0, 'sept'], // victoire extérieur
		['A – B — A ou match nul', 0.3, 3.2, 'trois'], // double chance
		['C – D — Plus de 2,5 buts', 0.28, 3.1, 'quatre'], // plus de buts
		['E – F — Moins de 2,5 buts', 0.2, 4.2, 'cinq'] // moins de buts
	];
	for (const [libelle, proba, cote, mot] of CAS) {
		it(`fonctionne sur « ${libelle.split(' — ')[1]} »`, async () => {
			const inp = input([frag(1, libelle, proba, cote)]);
			const t = await texteDe(inp, 1);
			expect(t, libelle).toContain(cote.toFixed(2).replace('.', ','));
			expect(t, libelle).toContain(`environ une fois sur ${mot}`);
			expect(checkGeneratedText(t, allowedNumbersFor(inp)).ok, libelle).toBe(true);
			expect(checkCausality(t).ok, libelle).toBe(true);
		});
	}
});
