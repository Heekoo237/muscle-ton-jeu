/**
 * resultDisplay.ts — Deux ajouts d'AFFICHAGE au résultat, purs et déterministes.
 * AUCUN nombre ne sort d'un LLM (règle d'or n°1) : tout est calcul ou lecture de base.
 */
import type { Market } from '$lib/types';
import { SEUIL_EVIDENCE } from './daily-analysis';

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
 * FEATURE 2 — sur un match retiré, ce que les chances disent le plus, DÉJÀ en base.
 * On CURATE au lieu de tout dérouler : un ou deux paris seulement, les plus probables,
 * jamais un calcul ni une proba dérivée à la volée (règles d'or n°1 et n°3 : aucune
 * suggestion, on affiche ce qu'on sait). Même discipline que la lecture du jour :
 *  - on EXCLUT la double chance (le pari le moins engageant, le moins parlant) ;
 *  - on EXCLUT « les deux marquent » (suspendu au modèle) ;
 *  - on EXCLUT l'ÉVIDENCE (> 72 %) : un quasi-certain affiché en orientation se lirait
 *    comme un « joue ça » déguisé ;
 *  - on EXCLUT le pari joué lui-même (il vient d'être retiré).
 * L'appelant titre « Sur ce match, voici ce que disent les chances » (ou « d'après les
 * cotes » en régime cote) — jamais « joue ça », la décision au joueur.
 */
export interface IssueVoisine {
	marche: Market;
	probabilite: number;
}
export const MAX_AUTRES_ISSUES = 2;

const DC: Market[] = ['DC_HOME_DRAW', 'DC_DRAW_AWAY', 'DC_HOME_AWAY'];
/** Paris jamais montrés en orientation : double chance (peu parlante) + BTTS (suspendu). */
const EXCLUS: ReadonlySet<Market> = new Set<Market>([...DC, 'BTTS_YES', 'BTTS_NO']);
/** Un pari et son complément ne se montrent jamais ensemble (redondant : l'un = 1 − l'autre). */
const COMPLEMENT: Partial<Record<Market, Market>> = {
	OVER_1_5: 'UNDER_1_5',
	UNDER_1_5: 'OVER_1_5',
	OVER_2_5: 'UNDER_2_5',
	UNDER_2_5: 'OVER_2_5',
	OVER_3_5: 'UNDER_3_5',
	UNDER_3_5: 'OVER_3_5'
};

/**
 * Les paris les plus probables à MONTRER sur un match retiré, depuis les prédictions
 * DÉJÀ en base. Déterministe, ≤ 2, jamais de calcul nouveau : on prend les plus hautes
 * probabilités hors double chance, hors « les deux marquent », hors évidence (> 72 %),
 * et hors le pari joué ; on ne montre jamais un pari ET son complément. Une base sans
 * pari éligible (rien qu'une double chance, ou tout est évident) ressort VIDE — le bloc
 * ne s'affiche pas plutôt que d'afficher une évidence ou une redondance.
 */
export function autresIssues(
	joue: Market,
	predictions: { marche: Market; probabilite: number }[]
): IssueVoisine[] {
	const proba = new Map<Market, number>();
	for (const p of predictions) if (!proba.has(p.marche)) proba.set(p.marche, p.probabilite);
	const candidats = [...proba.keys()]
		.filter((m) => m !== joue && !EXCLUS.has(m) && (proba.get(m) as number) <= SEUIL_EVIDENCE)
		.sort((a, b) => (proba.get(b) as number) - (proba.get(a) as number));

	const out: IssueVoisine[] = [];
	const pris = new Set<Market>();
	for (const m of candidats) {
		if (out.length >= MAX_AUTRES_ISSUES) break;
		const comp = COMPLEMENT[m];
		if (comp && pris.has(comp)) continue; // déjà le complément : on n'ajoute pas l'inverse
		out.push({ marche: m, probabilite: proba.get(m) as number });
		pris.add(m);
	}
	return out;
}

/**
 * Rattache à CHAQUE sélection retirée ses issues voisines (ordre → issues), depuis les
 * prédictions de son match. C'est le MAILLON entre le retrait et le bloc « Sur ce match,
 * voici ce que disent les chances » : extrait ici (plutôt qu'inline dans le +page.server) pour être
 * VERROUILLÉ par test — un bloc conditionné qui cesse de se déclencher est le bug qu'on
 * ne voit qu'en production. INVARIANT : une ligne retirée dont le match a des issues en
 * base ressort avec du contenu. Le formatage (libellé FR, %) reste à l'appelant.
 */
export function autresIssuesParRetrait(
	retirees: { ordre: number; marche: Market; fixtureId: number }[],
	predsParFixture: Map<number, { marche: Market; probabilite: number }[]>
): Map<number, IssueVoisine[]> {
	const out = new Map<number, IssueVoisine[]>();
	for (const s of retirees) {
		const issues = autresIssues(s.marche, predsParFixture.get(s.fixtureId) ?? []);
		if (issues.length) out.set(s.ordre, issues);
	}
	return out;
}
