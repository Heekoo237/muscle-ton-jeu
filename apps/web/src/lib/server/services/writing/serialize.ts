/**
 * serialize.ts — Le texte d'analyse deux niveaux est FIGÉ en base sous forme de
 * chaîne (colonne `analyses.texte`), pour être relu à l'identique dans
 * l'historique, sans jamais refacturer ni recalculer.
 *
 * On stocke un JSON. La relecture tolère les anciennes analyses (texte plat
 * d'avant la sortie deux niveaux) : une chaîne non-JSON devient une synthèse
 * seule, sans explications par sélection.
 */
import type { AnalyseTexte } from './index';

const MARQUE = 'mtj-analyse-v1';

interface Enveloppe {
	v: typeof MARQUE;
	synthese: string;
	parSelection: { ordre: number; texte: string }[];
}

export function serialiseAnalyse(a: AnalyseTexte): string {
	const env: Enveloppe = { v: MARQUE, synthese: a.synthese, parSelection: a.parSelection };
	return JSON.stringify(env);
}

export function parseAnalyse(stocke: string | null): AnalyseTexte | null {
	if (!stocke) return null;
	try {
		const env = JSON.parse(stocke) as Partial<Enveloppe>;
		if (env && env.v === MARQUE && typeof env.synthese === 'string') {
			return {
				synthese: env.synthese,
				parSelection: Array.isArray(env.parSelection) ? env.parSelection : []
			};
		}
	} catch {
		// Pas du JSON : ancienne analyse en texte plat.
	}
	return { synthese: stocke, parSelection: [] };
}
