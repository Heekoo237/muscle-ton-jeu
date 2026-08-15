/**
 * pair-match.ts — Résolution d'un match par la PAIRE, pas par le nom seul.
 *
 * Le principe (validé) : on cherche, dans la fenêtre, UN SEUL fixture dont les deux
 * équipes ressemblent aux deux noms du ticket. Le contexte du match lève l'ambiguïté
 * que le nom seul ne peut pas lever : « Séville »~« Sevilla » ET « Rayo Vallecano »
 * sur le même fixture, c'est quasi certain. On n'ajoute plus un alias par variante
 * d'orthographe — on identifie une paire, entièrement en code.
 *
 * DEUX GARDE-FOUS non négociables (règle d'archi n°3, « on ne devine pas ») :
 *  - le score de paire est le MIN des deux côtés : un côté excellent ne rachète
 *    JAMAIS un côté faible ;
 *  - il faut EXACTEMENT un candidat au-dessus du seuil, avec une MARGE franche sur
 *    le second. Deux candidats proches → AMBIGU → on ne résout pas.
 *
 * Seuils MESURÉS sur la carte d'alias curée (vérité terrain), pas choisis au juger —
 * voir pair-calibration.test.ts : à TAU 0,50, rappel 94,9 %, fausse paire 0,0 %.
 * Conservateur par défaut ; on ne baisse le seuil que quand la mesure le justifie.
 */
import type { Fixture } from '$lib/types';
import { teamSimilarity } from './similarity';

/** Seuil d'acceptation d'un côté (min de la paire). Mesuré, conservateur. */
export const TAU_PAIRE = 0.5;
/** Marge minimale entre le meilleur candidat et le second. En-dessous → ambigu. */
export const MARGE_PAIRE = 0.15;

export type PairMatch =
	| { decision: 'ok'; fixture: Fixture; score: number; second: number }
	| { decision: 'ambigu'; score: number; second: number }
	| { decision: 'aucun'; score: number };

/** Score d'un fixture pour la paire : meilleure des deux orientations, MIN des côtés. */
function scoreFixture(rawHome: string, rawAway: string, f: Fixture): number {
	const direct = Math.min(teamSimilarity(rawHome, f.teamHome), teamSimilarity(rawAway, f.teamAway));
	const inverse = Math.min(teamSimilarity(rawHome, f.teamAway), teamSimilarity(rawAway, f.teamHome));
	return Math.max(direct, inverse);
}

/**
 * Cherche le fixture qui correspond à la PAIRE (rawHome, rawAway). Insensible à
 * l'ordre d'affichage (les deux orientations sont testées) ; le CÔTÉ domicile/
 * extérieur est ensuite lu sur le fixture résolu, jamais sur l'ordre du ticket.
 */
export function pairMatchFixture(rawHome: string, rawAway: string, fixtures: Fixture[]): PairMatch {
	if (!rawHome || !rawAway || fixtures.length === 0) return { decision: 'aucun', score: 0 };
	let best: Fixture | null = null;
	let bestScore = -1;
	let second = 0;
	for (const f of fixtures) {
		const s = scoreFixture(rawHome, rawAway, f);
		if (s > bestScore) {
			second = bestScore;
			best = f;
			bestScore = s;
		} else if (s > second) {
			second = s;
		}
	}
	const secondScore = Math.max(second, 0);
	if (!best || bestScore < TAU_PAIRE) return { decision: 'aucun', score: Math.max(bestScore, 0) };
	// Un seul candidat franc : meilleur au-dessus du seuil ET nettement devant le second.
	if (bestScore - secondScore < MARGE_PAIRE) return { decision: 'ambigu', score: bestScore, second: secondScore };
	return { decision: 'ok', fixture: best, score: bestScore, second: secondScore };
}
