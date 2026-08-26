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

/**
 * Rattrapage SANS SÉPARATEUR — quand le libellé du match n'offre aucun « - » / « vs »
 * reconnu (un bookmaker qui écrit « contre », « : », ou rien). Au lieu d'allonger la
 * liste des séparateurs bookmaker par bookmaker, on renverse le problème : on cherche
 * DEUX équipes de notre base qui se rencontrent DANS le texte.
 *
 * Comment, sans deviner : on essaie CHAQUE coupure du texte en deux moitiés et on
 * réutilise `pairMatchFixture` — donc les MÊMES garde-fous mesurés (MIN des deux côtés,
 * seuil TAU, marge sur le second). Un mot de liaison (« vs », « contre », « : ») tombe
 * d'un côté et n'abaisse QUE la similarité de ce côté — ça rend la fausse paire plus
 * dure, jamais plus facile. On n'accepte que si UN SEUL fixture ressort franchement ;
 * deux fixtures proches (à des coupures différentes) → AMBIGU, on ne résout pas.
 *
 * Le côté domicile/extérieur vient du FIXTURE trouvé, jamais de l'ordre du texte —
 * comme partout ailleurs. On ne peut résoudre que vers un VRAI match en base : jamais
 * une paire inventée.
 */
export function pairMatchNoSep(matchText: string, fixtures: Fixture[]): PairMatch {
	const toks = matchText.split(/\s+/).filter((t) => t.length > 0);
	if (toks.length < 2 || fixtures.length === 0) return { decision: 'aucun', score: 0 };
	let best: { f: Fixture; score: number } | null = null;
	let rivalDifferent = 0; // meilleur score atteint par un AUTRE fixture (à une autre coupure)
	for (let i = 1; i < toks.length; i++) {
		const m = pairMatchFixture(toks.slice(0, i).join(' '), toks.slice(i).join(' '), fixtures);
		if (m.decision !== 'ok') continue;
		if (!best || m.score > best.score) {
			if (best && best.f.id !== m.fixture.id) rivalDifferent = Math.max(rivalDifferent, best.score);
			best = { f: m.fixture, score: m.score };
		} else if (m.fixture.id !== best.f.id) {
			rivalDifferent = Math.max(rivalDifferent, m.score);
		}
	}
	if (!best) return { decision: 'aucun', score: 0 };
	// Deux fixtures DIFFÉRENTS trop proches (l'un à une coupure, l'autre à une autre) →
	// on ne devine pas quel match c'est. Même discipline que pairMatchFixture.
	if (best.score - rivalDifferent < MARGE_PAIRE) {
		return { decision: 'ambigu', score: best.score, second: rivalDifferent };
	}
	return { decision: 'ok', fixture: best.f, score: best.score, second: rivalDifferent };
}
