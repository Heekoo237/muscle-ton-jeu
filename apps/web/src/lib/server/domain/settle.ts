/**
 * settle.ts — Règlement déterministe des tickets terminés. AUCUN LLM, AUCUN calcul
 * de probabilité : on compare le marché de chaque sélection au SCORE FINAL réel.
 *
 * Le résultat du ticket porté à l'historique est celui du ticket RENFORCÉ (les
 * sélections gardées, non retirées) — c'est la proposition du produit. Une
 * sélection dont le match n'est pas terminé reste « en attente » ; le ticket
 * n'est réglé que lorsque toutes ses sélections gardées le sont.
 */
import type { Market, Selection, TicketResult } from '$lib/types';
import { isAnalysable } from './ticket';

/** Le marché est-il gagné, au score final (h buts domicile, a buts extérieur) ? */
export function marketOutcome(market: Market, h: number, a: number): boolean {
	const total = h + a;
	switch (market) {
		case 'WIN_HOME':
			return h > a;
		case 'DRAW':
			return h === a;
		case 'WIN_AWAY':
			return h < a;
		case 'DC_HOME_DRAW':
			return h >= a;
		case 'DC_DRAW_AWAY':
			return h <= a;
		case 'DC_HOME_AWAY':
			return h !== a;
		case 'OVER_1_5':
			return total >= 2;
		case 'UNDER_1_5':
			return total <= 1;
		case 'OVER_2_5':
			return total >= 3;
		case 'UNDER_2_5':
			return total <= 2;
		case 'OVER_3_5':
			return total >= 4;
		case 'UNDER_3_5':
			return total <= 3;
		case 'BTTS_YES':
			return h >= 1 && a >= 1;
		case 'BTTS_NO':
			return !(h >= 1 && a >= 1);
	}
}

/** Score final d'un match, ou null tant qu'il n'est pas terminé. */
export type FinalScore = { home: number; away: number } | null;

/** Résultat d'une sélection : true = passée, false = tombée, null = en attente. */
export function selectionOutcome(s: Selection, score: FinalScore): boolean | null {
	if (!isAnalysable(s) || s.marche === null || score === null) return null;
	return marketOutcome(s.marche, score.home, score.away);
}

export interface SettlementResult {
	/** Résultat par sélection (clé = ordre) : true/false/null. */
	parSelection: Map<number, boolean | null>;
	/** Résultat du ticket renforcé : passe / tombe / en_attente. */
	ticket: TicketResult;
}

/**
 * Règle le ticket RENFORCÉ à partir des scores finals connus.
 * `scores` : fixtureId → score final (ou null si le match n'est pas terminé).
 *
 * - une sélection gardée tombée → ticket « tombe » (dès qu'elle est connue) ;
 * - toutes les sélections gardées passées et terminées → « passe » ;
 * - sinon (au moins une pas encore terminée) → « en_attente ».
 */
export function settleReinforced(
	selections: Selection[],
	scores: Map<number, FinalScore>
): SettlementResult {
	const parSelection = new Map<number, boolean | null>();
	for (const s of selections) {
		parSelection.set(s.ordre, selectionOutcome(s, s.fixtureId != null ? (scores.get(s.fixtureId) ?? null) : null));
	}

	const gardees = selections.filter((s) => isAnalysable(s) && !s.retireeDuRenforce);
	const issues = gardees.map((s) => parSelection.get(s.ordre) ?? null);

	let ticket: TicketResult;
	if (issues.some((o) => o === false)) {
		ticket = 'tombe'; // une sélection gardée est tombée
	} else if (issues.length > 0 && issues.every((o) => o === true)) {
		ticket = 'passe'; // toutes gardées, terminées, passées
	} else {
		ticket = 'en_attente'; // au moins une pas encore terminée
	}
	return { parSelection, ticket };
}
