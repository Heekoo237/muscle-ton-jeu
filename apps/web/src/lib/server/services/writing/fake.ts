import type { WritingService, WritingInput } from './index';

/** Formatage français : virgule décimale, espace insécable avant %. */
function pct(n: number): string {
	return `${n.toString().replace('.', ',')} %`;
}

/**
 * Rédaction factice : un texte au ton du produit qui n'emploie QUE les nombres
 * fournis. Conçu pour passer `guards.checkGeneratedText`. Le vrai modèle
 * (Session 8) produit un texte plus riche, soumis aux mêmes contrôles.
 */
export class FakeWriting implements WritingService {
	async writeAnalysis(input: WritingInput): Promise<string> {
		if (input.rienARetirer) {
			return 'Rien à retirer. Ton ticket tient debout.';
		}
		const retrait =
			input.nbRetirees === 1 ? '1 sélection retirée' : `${input.nbRetirees} sélections retirées`;
		const maillons =
			input.fragiles.length > 0
				? ` Les maillons faibles : ${input.fragiles.map((f) => f.libelleFr).join(', ')}.`
				: '';
		return (
			`${retrait}.${maillons} ` +
			`Tes chances passent de ${pct(input.probaTotalePct)} à ${pct(input.probaRenforceePct)}. ` +
			`On te dit où sont les maillons faibles, pas ce qui va arriver.`
		);
	}

	allowedNumbers(input: WritingInput): number[] {
		return [input.probaTotalePct, input.probaRenforceePct, input.nbRetirees];
	}
}
