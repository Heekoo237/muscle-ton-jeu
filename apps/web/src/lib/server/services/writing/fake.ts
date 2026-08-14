import type { WritingService, WritingInput, AnalyseTexte, RetraitEnrichi } from './index';
import { allowedNumbersFor } from './allowed';
import { syntheseDeterministe } from './enrich';

/**
 * Rédaction factice DÉTERMINISTE : un texte au ton du produit qui n'emploie que
 * les nombres et faits fournis, et n'affirme aucune causalité. Conçu pour passer
 * `checkGeneratedText` et `checkCausality`. Le vrai modèle (AnthropicWriting)
 * produit un texte plus vivant, soumis EXACTEMENT aux mêmes contrôles.
 *
 * Les compteurs de la synthèse sont écrits en toutes lettres (« neuf matchs »,
 * « trois fragiles ») : plus proche du parler visé, et hors de portée du garde-
 * fou des nombres — les pourcentages, eux, ne sont pas repris dans le texte.
 */
export class FakeWriting implements WritingService {
	async writeAnalysis(input: WritingInput): Promise<AnalyseTexte> {
		const synthese = syntheseDeterministe(input);
		if (input.rienARetirer) return { synthese, parSelection: [] };
		const parSelection = input.retraits.map((r) => ({ ordre: r.ordre, texte: this.pourRetrait(r) }));
		return { synthese, parSelection };
	}

	private pourRetrait(r: RetraitEnrichi): string {
		const tete = r.avecBadge
			? `${nomSelection(r.libelleFr)}, c'est risqué.`
			: `${nomSelection(r.libelleFr)}, la moins solide de ton ticket.`;
		const fait = r.faits[0] ? ` ${r.faits[0]}` : '';
		const chance = r.chanceSurMot ? ` ${cap(r.chanceSurMot)}, pas plus.` : '';
		return `${tete}${fait}${chance}`.trim();
	}

	allowedNumbers(input: WritingInput): number[] {
		return allowedNumbersFor(input);
	}
}

/** Capitale initiale (pour « une chance… » en tête de phrase). */
function cap(s: string): string {
	return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Partie « sélection » d'un libellé « Home – Away — Marché » (après le tiret cadratin). */
function nomSelection(libelleFr: string): string {
	const i = libelleFr.lastIndexOf(' — ');
	return i >= 0 ? libelleFr.slice(i + 3) : libelleFr;
}
