/**
 * devig.ts — Dévigage des cotes, PORT TypeScript de la fonction Python du collecteur
 * (`mtj_model/backtest/closing_odds.py::devig_power` + `compute.py`).
 *
 * POURQUOI un port et pas la « même fonction » littérale : le collecteur est en
 * Python (cron GitHub Actions), la récupération à la demande tourne dans l'app TS
 * sur Vercel, avec un budget < 2 s et aucun service Python vivant. On reproduit donc
 * le dévigage en TS et on le VERROUILLE octet pour octet sur la sortie Python via un
 * test doré (`devig.test.ts`, vecteurs générés depuis la vraie fonction). Zéro
 * divergence, vérifiée — pas supposée. Toute probabilité vient de ce calcul
 * déterministe (règle d'or n°1), jamais d'un modèle ni d'un LLM.
 */
import type { Market } from '$lib/types';

/**
 * Dé-margeage par PUISSANCE : pᵢ = (1/oᵢ)^k avec Σpᵢ = 1. Identique à
 * `devig_power` : racine 1-D de g(k)=Σ(1/oᵢ)^k−1 (monotone décroissante car
 * 1/oᵢ < 1) sur [0.2, 20], ici par bissection (brentq côté Python).
 */
export function devigPower(odds: number[]): number[] {
	const inv = odds.map((o) => 1 / o);
	const s = inv.reduce((a, b) => a + b, 0);
	if (Math.abs(s - 1) < 1e-9) return inv; // déjà juste (aucune marge)
	const g = (k: number) => inv.reduce((acc, p) => acc + Math.pow(p, k), 0) - 1;
	let lo = 0.2;
	let hi = 20;
	for (let i = 0; i < 200; i++) {
		const mid = (lo + hi) / 2;
		const gm = g(mid);
		if (Math.abs(gm) < 1e-12 || hi - lo < 1e-13) {
			lo = mid;
			hi = mid;
			break;
		}
		if (gm > 0) lo = mid; // g décroissante : g>0 → racine à droite (k plus grand)
		else hi = mid;
	}
	const k = (lo + hi) / 2;
	return inv.map((p) => Math.pow(p, k));
}

/** Groupes dé-vigés ENSEMBLE (la marge se retire sur l'ensemble mutuel), comme `ODDS_GROUPS`
 *  + les marchés additionnels récupérés par événement (1,5 / 3,5 / BTTS). */
const GROUPS: { marches: Market[] }[] = [
	{ marches: ['WIN_HOME', 'DRAW', 'WIN_AWAY'] },
	{ marches: ['OVER_2_5', 'UNDER_2_5'] },
	{ marches: ['OVER_1_5', 'UNDER_1_5'] },
	{ marches: ['OVER_3_5', 'UNDER_3_5'] },
	{ marches: ['BTTS_YES', 'BTTS_NO'] }
];

/** Double chance DÉRIVÉE du 1X2 dé-vigé (arithmétique), source `cote_derivee`. */
const DC_DERIVED: [Market, [Market, Market]][] = [
	['DC_HOME_DRAW', ['WIN_HOME', 'DRAW']],
	['DC_DRAW_AWAY', ['DRAW', 'WIN_AWAY']],
	['DC_HOME_AWAY', ['WIN_HOME', 'WIN_AWAY']]
];

/** Un groupe est-il DÉVIGEABLE ? (toutes présentes, > 1, marge ≥ 0) — comme `valid_odds_group`. */
function groupeValide(vals: (number | undefined)[]): boolean {
	if (vals.some((v) => v === undefined || v === null)) return false;
	if (vals.some((v) => (v as number) <= 1)) return false;
	const sommeImplicite = vals.reduce((a, v) => a + 1 / (v as number), 0);
	return sommeImplicite >= 1 - 1e-9; // marge négative → rejeté (comme le collecteur)
}

export interface ProbaCote {
	marche: Market;
	probabilite: number;
	/** cote_seule (cote lue et dé-vigée) ou cote_derivee (double chance arithmétique). */
	source: 'cote_seule' | 'cote_derivee';
}

/**
 * Cotes décimales brutes (par marché) → probabilités dé-vigées + double chance dérivée.
 * Un groupe absent ou aberrant reste sans probabilité (jamais deviné, règle d'archi n°3).
 * MÊME logique que `league_predictions_cote_seule` (hors persistance).
 */
export function devigMarches(raw: Partial<Record<Market, number>>): ProbaCote[] {
	const probs = new Map<Market, number>();
	for (const { marches } of GROUPS) {
		const vals = marches.map((m) => raw[m]);
		if (vals.every((v) => v === undefined)) continue; // marché non relevé : silencieux
		if (!groupeValide(vals)) continue; // au moins une cote présente mais indévigeable
		const dv = devigPower(vals as number[]);
		marches.forEach((m, i) => probs.set(m, dv[i]));
	}
	const out: ProbaCote[] = [];
	for (const [m, p] of probs) out.push({ marche: m, probabilite: p, source: 'cote_seule' });
	// Double chance : seulement si le 1X2 complet est présent.
	if (['WIN_HOME', 'DRAW', 'WIN_AWAY'].every((m) => probs.has(m as Market))) {
		for (const [dc, [a, b]] of DC_DERIVED) {
			out.push({ marche: dc, probabilite: probs.get(a)! + probs.get(b)!, source: 'cote_derivee' });
		}
	}
	return out;
}
