/**
 * resultDisplay.ts — Deux ajouts d'AFFICHAGE au résultat, purs et déterministes.
 * AUCUN nombre ne sort d'un LLM (règle d'or n°1) : tout est calcul ou lecture de base.
 */
import type { Market } from '$lib/types';

/**
 * FEATURE 1 — le multiplicateur d'effet du retrait, À CÔTÉ du pourcentage (jamais à
 * la place, jamais seul : le % dit l'échelle réelle, notre honnêteté). CALCUL EN
 * CODE, jamais écrit par le rédacteur.
 *
 * On n'affiche RIEN si :
 *  - il n'y a pas eu de retrait (aucun effet à montrer) ;
 *  - le retrait ne change RIEN au pourcentage AFFICHÉ (égalité après arrondi) — on
 *    ne prétend pas à un effet qu'on n'a pas, même quand le ratio brut vaut ~1.
 * Sinon : « N fois plus de chances » dès ×2 (arrondi lisible, jamais « 26,4 fois »),
 * « un peu plus de chances » entre 1 et 2.
 */
export function multiplicateurRetrait(
	probaTotale: number,
	probaRenforcee: number,
	aRetrait: boolean
): string | null {
	if (!aRetrait || probaTotale <= 0) return null;
	// Même arrondi que l'affichage (pct à 1 décimale) : le garde-fou « effet visible »
	// se juge sur ce que l'œil voit, pas sur le ratio brut.
	const pct1 = (p: number) => Math.round(p * 1000) / 10;
	if (pct1(probaRenforcee) <= pct1(probaTotale)) return null;
	const ratio = probaRenforcee / probaTotale;
	return ratio >= 2 ? `${Math.round(ratio)} fois plus de chances` : 'un peu plus de chances';
}

/**
 * FEATURE 2 — les autres issues du MÊME match d'une ligne retirée. On MONTRE ce qui
 * est DÉJÀ en base, jamais un calcul ni une probabilité dérivée à la volée (règles
 * d'or n°1 et n°3 : aucune suggestion, on affiche ce qu'on sait). Trois lignes max.
 * L'appelant titre « Si tu veux garder ce match » — neutre, la décision au joueur.
 */
export interface IssueVoisine {
	marche: Market;
	probabilite: number;
}
export const MAX_AUTRES_ISSUES = 3;

const ISSUES_1X2: Market[] = ['WIN_HOME', 'DRAW', 'WIN_AWAY'];
const DC: Market[] = ['DC_HOME_DRAW', 'DC_DRAW_AWAY', 'DC_HOME_AWAY'];
const OVERS: Market[] = ['OVER_1_5', 'OVER_2_5', 'OVER_3_5']; // seuil croissant
const UNDERS: Market[] = ['UNDER_1_5', 'UNDER_2_5', 'UNDER_3_5'];
const COMPLEMENT: Partial<Record<Market, Market>> = {
	OVER_1_5: 'UNDER_1_5',
	UNDER_1_5: 'OVER_1_5',
	OVER_2_5: 'UNDER_2_5',
	UNDER_2_5: 'OVER_2_5',
	OVER_3_5: 'UNDER_3_5',
	UNDER_3_5: 'OVER_3_5'
};

/**
 * Choisit les issues voisines à MONTRER pour un pari retiré, depuis les prédictions
 * DÉJÀ en base de son match. Déterministe, ≤ 3, jamais de calcul nouveau :
 *  - 1X2 joué  → les deux autres issues 1X2 (proba desc) + la double chance la plus haute ;
 *  - DC joué   → les trois issues 1X2 (proba desc) ;
 *  - plus/moins → le complément (même seuil) puis les autres seuils de la même
 *    direction, seuil croissant. En cote seule, seul le 2,5 existe → une seule ligne.
 * Une issue absente de la base n'est jamais inventée (règle d'archi n°3).
 */
export function autresIssues(
	joue: Market,
	predictions: { marche: Market; probabilite: number }[]
): IssueVoisine[] {
	const proba = new Map<Market, number>();
	for (const p of predictions) if (!proba.has(p.marche)) proba.set(p.marche, p.probabilite);
	const present = (m: Market) => proba.has(m);
	const mk = (m: Market): IssueVoisine => ({ marche: m, probabilite: proba.get(m) as number });
	const parProbaDesc = (a: Market, b: Market) => (proba.get(b) as number) - (proba.get(a) as number);

	if (ISSUES_1X2.includes(joue)) {
		const out = ISSUES_1X2.filter((m) => m !== joue && present(m)).sort(parProbaDesc).map(mk);
		const meilleureDc = DC.filter(present).sort(parProbaDesc)[0];
		if (meilleureDc) out.push(mk(meilleureDc));
		return out.slice(0, MAX_AUTRES_ISSUES);
	}
	if (DC.includes(joue)) {
		return ISSUES_1X2.filter(present).sort(parProbaDesc).map(mk).slice(0, MAX_AUTRES_ISSUES);
	}
	if (COMPLEMENT[joue]) {
		const out: IssueVoisine[] = [];
		const comp = COMPLEMENT[joue] as Market;
		if (present(comp)) out.push(mk(comp));
		const memeDirection = OVERS.includes(joue) ? OVERS : UNDERS;
		for (const m of memeDirection) if (m !== joue && present(m)) out.push(mk(m));
		return out.slice(0, MAX_AUTRES_ISSUES);
	}
	return []; // BTTS (suspendu) ou marché sans voisin défini.
}
