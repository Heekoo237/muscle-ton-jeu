/**
 * regime.ts — Le RÉGIME d'une sélection, déduit de la source de sa probabilité.
 *
 * Deux régimes, une seule différence qui compte pour le texte et les faits :
 *  - 'mesure' : championnat backtesté (source odds/model/repli). On a mesuré la
 *    calibration ; on a un historique football-data → des faits descriptifs.
 *  - 'cote'   : championnat non backtesté (source cote_seule/cote_derivee). On n'a
 *    PAS mesuré, on n'a PAS d'historique → aucun fait, « d'après les cotes » seul.
 *
 * Règle produit (CLAUDE.md, § deux régimes) : en régime 'cote', le rédacteur ne
 * prononce jamais un mot qui suggère une mesure, et n'énonce aucun fait statistique
 * (on n'en a pas). Le service de stats ne doit RIEN renvoyer pour ces matchs —
 * jamais des données partielles.
 */
import type { PredictionSource } from '$lib/types';

export type Regime = 'cote' | 'mesure';

const SOURCES_COTE: readonly PredictionSource[] = ['cote_seule', 'cote_derivee'];

/** Régime d'une sélection d'après la source de sa probabilité. Défaut prudent :
 *  une source absente n'ouvre jamais le régime « mesure » par erreur → 'cote'. */
export function regimeOf(source: PredictionSource | null | undefined): Regime {
	if (!source) return 'cote';
	return SOURCES_COTE.includes(source) ? 'cote' : 'mesure';
}

/** Vrai si la sélection a un historique exploitable (→ on peut lire des faits). */
export function aDesFaits(source: PredictionSource | null | undefined): boolean {
	return regimeOf(source) === 'mesure';
}
