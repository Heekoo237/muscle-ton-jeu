import type { WritingService, WritingInput, AnalyseTexte, RetraitEnrichi } from './index';
import { allowedNumbersFor } from './allowed';
import { syntheseDeterministe, enMots, formatCote } from './enrich';

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
		// La traduction de la cote ne va que sur la sélection la plus risquée (proba la
		// plus basse ⇒ chanceSur le plus grand), comme le vrai rédacteur.
		const cible = input.retraits
			.filter((r) => r.cote != null && r.chanceSur != null)
			.sort((a, b) => (b.chanceSur ?? 0) - (a.chanceSur ?? 0))[0];
		const parSelection = input.retraits.map((r) => ({
			ordre: r.ordre,
			texte: this.pourRetrait(r, cible?.ordre === r.ordre)
		}));
		return { synthese, parSelection };
	}

	private pourRetrait(r: RetraitEnrichi, traduitLaCote: boolean): string {
		const nom = nomSelection(r.libelleFr);
		const tete = r.avecBadge ? `${nom}, c'est risqué.` : `${nom}, la moins solide de ton ticket.`;
		// Traduction pédagogique de la cote (nombres FOURNIS : cote lue + « une fois sur X »
		// tiré de notre proba, jamais un calcul sur la cote). Uniquement sur la cible.
		const traduction =
			traduitLaCote && r.cote != null && r.chanceSur != null
				? ` Une cote à ${formatCote(r.cote)}, c'est rare : ça passe environ une fois sur ${enMots(r.chanceSur)}.`
				: '';
		if (r.faits.length) {
			// Faits d'abord ; la traduction S'AJOUTE (elle ne remplace pas les faits).
			return `${tete} ${r.faits.join(' ')}${traduction}`.trim();
		}
		if (traduction) {
			// Sans fait, la traduction PORTE l'explication (bien mieux que l'aveu creux).
			return `${tete}${traduction}`.trim();
		}
		// Ni fait ni cote : aveu honnête, sans meubler.
		const aveu = r.avecBadge
			? " On n'a rien de marquant à signaler. C'est la cote qui le rend fragile."
			: " On n'a rien de marquant à signaler. C'est la cote qui le place en dernier.";
		const chance = r.chanceSurMot ? ` ${cap(r.chanceSurMot)}, pas plus.` : '';
		return `${tete}${aveu}${chance}`.trim();
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
