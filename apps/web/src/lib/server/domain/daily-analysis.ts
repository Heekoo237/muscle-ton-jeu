/**
 * daily-analysis.ts — Choix de l'ANALYSE DU JOUR. Fonction PURE et DÉTERMINISTE :
 * la graine est la DATE du jour, donc le même jour, tout le monde voit la même
 * analyse, figée, qui ne change pas à la reconnexion (c'était le bug principal).
 *
 * Elle ne montre JAMAIS la double chance (le marché le moins engageant, qui gagne
 * mécaniquement le critère « proba la plus haute ») ni le BTTS (suspendu au modèle,
 * biais variable — incohérent de l'afficher en vitrine alors qu'on refuse de
 * l'analyser sur les tickets).
 *
 * Trois FAMILLES en rotation (une par jour) : victoire simple du favori · match nul ·
 * plus/moins de buts. Trois critères d'INTÉRÊT : match serré (forte incertitude 1X2),
 * nul sous-estimé, favori pas si solide. On ÉCARTE l'évidence (une issue > 72 %).
 *
 * Le ton ne propose jamais : « une lecture du jour », jamais « joue ça ». La vue ajoute
 * « Ce n'est pas un pronostic. On montre ce que disent les chances. »
 */
import type { Market } from '$lib/types';
import { marketLabelFr } from './market-map';

export type FamilleJour = 'favori' | 'nul' | 'buts';
/** Rotation : une famille par jour. Jamais double chance, jamais BTTS. */
export const FAMILLES: FamilleJour[] = ['favori', 'nul', 'buts'];

/** Au-delà de ce seuil sur une issue 1X2, le match est une ÉVIDENCE : on l'écarte. */
export const SEUIL_EVIDENCE = 0.72;
/** Valeur « habituelle » d'un nul : au-dessus, le nul est sous-estimé (intéressant). */
const NUL_BASELINE = 0.26;

export interface CandidatJour {
	fixtureId: number;
	teamHome: string;
	teamAway: string;
	dateMs: number;
	/** Probabilités par marché (table predictions). Absent = marché non prédit. */
	probas: Partial<Record<Market, number>>;
}

export interface AnalyseDuJour {
	matchLabel: string;
	dateMs: number;
	marche: Market;
	libelleFr: string;
	probabilitePct: number;
	famille: FamilleJour;
}

/** Hash déterministe d'une chaîne (jour) → entier positif. Pas de Math.random. */
export function hashJour(cle: string): number {
	let h = 2166136261;
	for (let i = 0; i < cle.length; i++) {
		h ^= cle.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Clé de jour LOCALE (UTC+1) — l'analyse se fige par jour civil. */
export function cleDuJour(nowMs: number): string {
	return new Date(nowMs + 3600_000).toISOString().slice(0, 10);
}

function entropie1x2(ph: number, pd: number, pa: number): number {
	const t = (p: number) => (p > 0 ? -p * Math.log(p) : 0);
	return (t(ph) + t(pd) + t(pa)) / Math.log(3); // normalisée [0,1] : 1 = parfaitement incertain
}

/** Bosse centrée : haute au milieu d'une bande, nulle aux bords. Pour « favori pas si solide ». */
function bosse(p: number, centre: number, demiLargeur: number): number {
	return Math.max(0, 1 - Math.abs(p - centre) / demiLargeur);
}

interface Choix {
	marche: Market;
	proba: number;
	score: number;
}

/** Pour une famille donnée, le marché à montrer et le score d'intérêt du candidat (ou null). */
function evaluer(c: CandidatJour, famille: FamilleJour): Choix | null {
	const ph = c.probas.WIN_HOME;
	const pd = c.probas.DRAW;
	const pa = c.probas.WIN_AWAY;
	if (ph == null || pd == null || pa == null) return null; // pas de 1X2 → inéligible
	// ÉVIDENCE : une issue trop probable → tout le monde le sait, on écarte.
	if (Math.max(ph, pd, pa) > SEUIL_EVIDENCE) return null;

	const serre = entropie1x2(ph, pd, pa); // critère partagé : match serré

	if (famille === 'nul') {
		// Nul sous-estimé : d'autant plus intéressant que P(nul) dépasse l'habituel.
		if (pd < 0.28) return null;
		const score = 2 * (pd - NUL_BASELINE) + 0.6 * serre;
		return { marche: 'DRAW', proba: pd, score };
	}

	if (famille === 'favori') {
		// Favori pas si solide : favori réel (0,42–0,72), d'autant plus parlant qu'il est
		// « moins solide qu'il n'y paraît » (bosse centrée ~0,52).
		const favHome = ph >= pa;
		const pFav = favHome ? ph : pa;
		if (pFav < 0.42) return null; // pas de vrai favori → pas cette famille
		const score = 1.5 * bosse(pFav, 0.52, 0.14) + 0.6 * serre;
		return { marche: favHome ? 'WIN_HOME' : 'WIN_AWAY', proba: pFav, score };
	}

	// buts : le marché plus/moins le plus DÉCISIF sans être trivial (bande 0,55–0,72).
	const candidatsButs: [Market, number | undefined][] = [
		['OVER_2_5', c.probas.OVER_2_5], ['UNDER_2_5', c.probas.UNDER_2_5],
		['OVER_1_5', c.probas.OVER_1_5], ['UNDER_3_5', c.probas.UNDER_3_5]
	];
	let meilleur: Choix | null = null;
	for (const [m, p] of candidatsButs) {
		if (p == null || p <= 0.5 || p > SEUIL_EVIDENCE) continue;
		const score = 1.5 * bosse(p, 0.63, 0.12) + 0.6 * serre;
		if (!meilleur || score > meilleur.score) meilleur = { marche: m, proba: p, score };
	}
	return meilleur;
}

/**
 * Choisit l'analyse du jour, déterministe pour `dayKey`. Rotation de famille par le
 * jour ; à défaut de candidat pour la famille du jour, on essaie les autres familles
 * (ordre déterministe). Renvoie null si AUCUN match non-évident n'est disponible.
 */
export function choisirAnalyseDuJour(candidats: CandidatJour[], dayKey: string): AnalyseDuJour | null {
	const graine = hashJour(dayKey);
	// Ordre des familles à essayer : celle du jour d'abord, puis les autres.
	const depart = graine % FAMILLES.length;
	const ordre = [0, 1, 2].map((i) => FAMILLES[(depart + i) % FAMILLES.length]);

	for (const famille of ordre) {
		const notes = candidats
			.map((c) => ({ c, choix: evaluer(c, famille) }))
			.filter((x): x is { c: CandidatJour; choix: Choix } => x.choix !== null)
			// Tri déterministe : score desc, puis fixtureId (stable, jamais l'ordre DB).
			.sort((a, b) => b.choix.score - a.choix.score || a.c.fixtureId - b.c.fixtureId);
		if (notes.length === 0) continue;

		// Parmi le haut du panier, la graine choisit lequel (varie d'un jour à l'autre).
		const topK = notes.slice(0, Math.min(5, notes.length));
		const pick = topK[graine % topK.length];
		const { c, choix } = pick;
		return {
			matchLabel: `${c.teamHome} – ${c.teamAway}`,
			dateMs: c.dateMs,
			marche: choix.marche,
			libelleFr: marketLabelFr(choix.marche, c.teamHome, c.teamAway),
			probabilitePct: Math.round(choix.proba * 100 * 10) / 10,
			famille
		};
	}
	return null;
}
