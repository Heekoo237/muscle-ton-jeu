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

/** Marchés couverts, réglables contre un score. BTTS inclus : réglable même si sa
 *  PROBABILITÉ reste suspendue (on ne PRODUIT pas de proba, on lit juste le score). */
const COVERED_MARKETS: ReadonlySet<string> = new Set<Market>([
	'WIN_HOME', 'DRAW', 'WIN_AWAY',
	'DC_HOME_DRAW', 'DC_DRAW_AWAY', 'DC_HOME_AWAY',
	'OVER_1_5', 'UNDER_1_5', 'OVER_2_5', 'UNDER_2_5', 'OVER_3_5', 'UNDER_3_5',
	'BTTS_YES', 'BTTS_NO'
]);

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

/**
 * Règle un marché contre un score, en tolérant un marché NON couvert (→ null,
 * jamais réglé). POINT D'ENTRÉE UNIQUE du règlement par marché : l'historique, le
 * tableau de bord et le bandeau passent tous par ici (plus de switch dupliqué).
 */
export function settleMarket(marche: Market | string | null, h: number, a: number): boolean | null {
	if (marche === null || !COVERED_MARKETS.has(marche)) return null;
	return marketOutcome(marche as Market, h, a);
}

/** Score final d'un match, ou null tant qu'il n'est pas terminé. */
export type FinalScore = { home: number; away: number } | null;

/**
 * Une sélection est RÉGLABLE si elle porte un marché couvert sur un match résolu.
 * Distinct d'`isAnalysable` (qui exige aussi une probabilité) : le règlement ne
 * dépend QUE du score réel, jamais d'avoir eu une proba pour la sélection.
 */
export function isSettleable(s: Selection): boolean {
	return s.etatResolution === 'certain' && s.marche !== null && s.fixtureId !== null;
}

/** Résultat d'une sélection : true = passée, false = tombée, null = en attente. */
export function selectionOutcome(s: Selection, score: FinalScore): boolean | null {
	if (!isSettleable(s) || s.marche === null || score === null) return null;
	return settleMarket(s.marche, score.home, score.away);
}

export interface SettlementResult {
	/** Résultat par sélection (clé = ordre) : true/false/null. */
	parSelection: Map<number, boolean | null>;
	/** Résultat du ticket renforcé : passe / tombe / en_attente. */
	ticket: TicketResult;
}

/** Verdict d'un groupe de sélections déjà réglées (leurs issues true/false/null). */
function groupVerdict(issues: (boolean | null)[]): TicketResult {
	if (issues.length === 0 || issues.some((o) => o === null)) return 'en_attente';
	return issues.some((o) => o === false) ? 'tombe' : 'passe';
}

export interface TicketVerdict {
	/** Résultat par sélection (clé = ordre) : true/false/null. */
	parSelection: Map<number, boolean | null>;
	/** Résultat du ticket ORIGINAL (toutes les sélections réglables). */
	originale: TicketResult;
	/** Résultat du ticket RENFORCÉ (les sélections gardées, non retirées). */
	renforce: TicketResult;
	/** Ordre de la 1re sélection réglable tombée (pour « tombé sur ce match »). */
	premierPerduOrdre: number | null;
}

/**
 * Règle un ticket à partir des scores finals connus, et renvoie À LA FOIS le
 * verdict de l'ORIGINAL (toutes les sélections réglables) et celui du RENFORCÉ
 * (les gardées). `scores` : fixtureId → score final (ou null si non terminé).
 *
 * Un groupe est « en_attente » tant qu'une de ses sélections n'est pas terminée ;
 * « tombe » si une est perdue une fois tout terminé ; « passe » sinon. C'est LE
 * point de règlement d'un ticket — l'historique et le tableau de bord en dérivent.
 */
export function settleTicket(selections: Selection[], scores: Map<number, FinalScore>): TicketVerdict {
	const parSelection = new Map<number, boolean | null>();
	for (const s of selections) {
		const sc = s.fixtureId != null ? (scores.get(s.fixtureId) ?? null) : null;
		parSelection.set(s.ordre, selectionOutcome(s, sc));
	}
	const reglables = selections.filter(isSettleable).sort((a, b) => a.ordre - b.ordre);
	const gardees = reglables.filter((s) => !s.retireeDuRenforce);
	const premierPerdu = reglables.find((s) => parSelection.get(s.ordre) === false);
	return {
		parSelection,
		originale: groupVerdict(reglables.map((s) => parSelection.get(s.ordre) ?? null)),
		renforce: groupVerdict(gardees.map((s) => parSelection.get(s.ordre) ?? null)),
		premierPerduOrdre: premierPerdu ? premierPerdu.ordre : null
	};
}

/**
 * Résultat du ticket RENFORCÉ seul. Conservé pour compat ; délègue à `settleTicket`
 * (source unique). Le renforcé est la proposition du produit portée à l'historique.
 */
export function settleReinforced(
	selections: Selection[],
	scores: Map<number, FinalScore>
): SettlementResult {
	const v = settleTicket(selections, scores);
	return { parSelection: v.parSelection, ticket: v.renforce };
}
