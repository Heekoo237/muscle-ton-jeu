/**
 * market-map.ts — Résolution des marchés. Fichier de configuration, pas de l'IA.
 *
 * Règle d'archi n°3 : un marché non reconnu est INCONNU. L'état « probable »
 * n'existe pas. Tout ce qui n'est pas dans la table est INCONNU, jamais deviné.
 *
 * La table vit à terme dans la base (`market_map`, actif propriétaire enrichi à
 * la main). Ici, la table de départ du brief §8 sert de source pour le seed.
 */
import type { Market, ResolutionState } from '$lib/types';

export interface MarketResolution {
	state: ResolutionState;
	market: Market | null;
	/** Renseigné quand state !== 'certain' : pourquoi. */
	raison?: 'non_couvert' | 'inconnu' | 'ambigu';
	/** Pour un cas ambigu : les marchés proposés au choix (jamais deviné). */
	candidates?: Market[];
}

/** Normalisation d'une notation bookmaker avant recherche en table. */
function normalize(notation: string): string {
	return notation
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // retirer les accents (diacritiques combinants)
		.replace(/\s+/g, ' ')
		.trim();
}

/** Table stricte notation → marché interne (brief §8). Clés déjà normalisées. */
const TABLE: Record<string, Market> = {
	// 1X2
	'1': 'WIN_HOME',
	w1: 'WIN_HOME',
	'victoire 1': 'WIN_HOME',
	home: 'WIN_HOME',
	x: 'DRAW',
	nul: 'DRAW',
	draw: 'DRAW',
	'2': 'WIN_AWAY',
	w2: 'WIN_AWAY',
	away: 'WIN_AWAY',
	// Double chance
	'1x': 'DC_HOME_DRAW',
	'10': 'DC_HOME_DRAW',
	'double chance 1x': 'DC_HOME_DRAW',
	x2: 'DC_DRAW_AWAY',
	'02': 'DC_DRAW_AWAY',
	'12': 'DC_HOME_AWAY',
	// Plus/moins de buts (seuils 1.5, 2.5, 3.5)
	'tb 1.5': 'OVER_1_5',
	'plus 1.5': 'OVER_1_5',
	'over 1.5': 'OVER_1_5',
	'total > 1.5': 'OVER_1_5',
	'tm 1.5': 'UNDER_1_5',
	'moins 1.5': 'UNDER_1_5',
	'under 1.5': 'UNDER_1_5',
	'tb 2.5': 'OVER_2_5',
	'plus 2.5': 'OVER_2_5',
	'over 2.5': 'OVER_2_5',
	'total > 2.5': 'OVER_2_5',
	'tm 2.5': 'UNDER_2_5',
	'moins 2.5': 'UNDER_2_5',
	'under 2.5': 'UNDER_2_5',
	'tb 3.5': 'OVER_3_5',
	'plus 3.5': 'OVER_3_5',
	'over 3.5': 'OVER_3_5',
	'total > 3.5': 'OVER_3_5',
	'tm 3.5': 'UNDER_3_5',
	'moins 3.5': 'UNDER_3_5',
	'under 3.5': 'UNDER_3_5',
	// Les deux équipes marquent
	btts: 'BTTS_YES',
	oui: 'BTTS_YES',
	'les deux marquent': 'BTTS_YES',
	'btts non': 'BTTS_NO',
	non: 'BTTS_NO'
};

/**
 * Marchés explicitement NON couverts (CLAUDE.md). Reconnus — en français ET dans
 * les notations anglaises des bookmakers (Betclic, 1xBet, Betwinner) — pour
 * pouvoir dire « non analysé · non facturé », jamais pour produire une probabilité.
 */
const UNCOVERED = [
	// Corners
	/\bcorner/,
	// Cartons
	/\bcarton/,
	/\bcard/,
	/\bbooking/,
	// Tirs
	/\btir(s)?\b/,
	/\bshot/,
	// Buteur (français + anglais)
	/\bbuteur\b/,
	/\bgoalscorer\b/,
	/\bscorer\b/,
	/\banytime\b/,
	/\bto score\b/,
	/\bmarque un but\b/,
	// Mi-temps / première période
	/\bmi-?temps\b/,
	/\bhalf-?time\b/,
	/\bhalf time\b/,
	/\b1st half\b/,
	/\b1re mi-temps\b/,
	/\b1mt\b/,
	/\bht\/ft\b/,
	// Score exact
	/\bscore exact\b/,
	/\bcorrect score\b/,
	// Handicap
	/\bhandicap\b/
];

/**
 * Notations « plus/moins de buts » SANS seuil visible → ambigu (PRD §6.3).
 * On ne devine jamais le seuil : on propose les trois au choix.
 */
const AMBIGUOUS_OVER = new Set(['tb', 'over', 'plus', 'total >', 'total']);
const AMBIGUOUS_UNDER = new Set(['tm', 'under', 'moins']);
const OVER_CANDIDATES: Market[] = ['OVER_1_5', 'OVER_2_5', 'OVER_3_5'];
const UNDER_CANDIDATES: Market[] = ['UNDER_1_5', 'UNDER_2_5', 'UNDER_3_5'];

/**
 * Certains bookmakers (Betclic…) collent le CHOIX devant le TYPE de marché :
 *   « Paris SG Résultat du match »  ·  « Nul Résultat du match »
 *   « Saint-Étienne ou Nul Double chance »
 * On sépare ici le TYPE (résultat / double chance / les deux marquent) du CHOIX.
 * Le CHOIX est résolu ENSUITE contre les vraies équipes du match (resolve.ts) —
 * jamais deviné. Renvoie null si la notation n'est pas un marché « à choix ».
 *
 * Les phrases de TYPE sont vérifiées sur de VRAIES captures. Français d'abord
 * (nos bookmakers sont francophones) ; anglais pour les libellés mixtes.
 */
const TYPE_1X2 = [
	'resultat du match',
	'resultat final',
	'match result',
	'full time result',
	'1x2',
	'vainqueur du match'
];
const TYPE_DC = ['double chance'];
const TYPE_BTTS = ['les deux equipes marquent', 'both teams to score', 'les deux marquent'];
/** Bruit à retirer : « (t. rég) », « temps réglementaire », « (90 min) »… */
const RESULT_NOISE = /\(?\bt\.?\s*reg\w*\)?|\btemps reglementaire\b|\(90 ?min\)|\(t\.r\)/g;

export interface ResultSplit {
	kind: '1x2' | 'dc' | 'btts';
	/** La partie « choix » restante (ex. « paris sg », « nul », « paris sg ou nul »). */
	choice: string;
}

export function splitResultMarket(notation: string): ResultSplit | null {
	let n = normalize(notation).replace(RESULT_NOISE, ' ').replace(/\s+/g, ' ').trim();
	const strip = (phrase: string): string => n.replace(phrase, ' ').replace(/\s+/g, ' ').trim();
	for (const p of TYPE_1X2) if (n.includes(p)) return { kind: '1x2', choice: strip(p) };
	for (const p of TYPE_DC) if (n.includes(p)) return { kind: 'dc', choice: strip(p) };
	for (const p of TYPE_BTTS) if (n.includes(p)) return { kind: 'btts', choice: strip(p) };
	return null;
}

/**
 * Notations « plus/moins de buts » COMPLÈTES des bookmakers : le seuil ET la
 * direction sont dans la phrase, pas dans une clé propre. Ex. Betclic :
 *   « + de 1,5 - Nombre total de buts (t. rég) »  ·  « - de 2,5 buts »
 * On extrait le seuil (1,5 / 2,5 / 3,5) et la direction (+ / plus vs − / moins).
 * `normalize` NE retire PAS la ponctuation : les signes + / − portent la direction,
 * on ne peut pas les perdre. Seuil absent, ou direction ambiguë/absente → null :
 * on reste INCONNU, jamais deviné (règle d'archi n°3).
 */
function parseTotals(n: string): Market | null {
	if (!/\bbuts?\b/.test(n) && !/nombre total/.test(n)) return null;
	const seuil = n.match(/([123])[.,]5\b/);
	if (!seuil) return null;
	const over = /\bplus\b/.test(n) || /(^|\s)\+\s*de\b/.test(n) || /\bover\b/.test(n);
	const under = /\bmoins\b/.test(n) || /(^|\s)-\s*de\b/.test(n) || /\bunder\b/.test(n);
	if (over === under) return null; // ni l'un ni l'autre, ou les deux : on ne devine pas
	return `${over ? 'OVER' : 'UNDER'}_${seuil[1]}_5` as Market;
}

export function resolveMarket(notation: string): MarketResolution {
	const n = normalize(notation);
	if (n in TABLE) {
		return { state: 'certain', market: TABLE[n] };
	}
	const totals = parseTotals(n);
	if (totals) {
		return { state: 'certain', market: totals };
	}
	if (AMBIGUOUS_OVER.has(n)) {
		return { state: 'ambigu', market: null, raison: 'ambigu', candidates: OVER_CANDIDATES };
	}
	if (AMBIGUOUS_UNDER.has(n)) {
		return { state: 'ambigu', market: null, raison: 'ambigu', candidates: UNDER_CANDIDATES };
	}
	if (UNCOVERED.some((re) => re.test(n))) {
		return { state: 'inconnu', market: null, raison: 'non_couvert' };
	}
	return { state: 'inconnu', market: null, raison: 'inconnu' };
}

/* ------------------------------------------------------------------------ */
/*  LIBELLÉS FRANÇAIS (ton du produit) — jamais de notation bookmaker         */
/* ------------------------------------------------------------------------ */

const SEUIL: Partial<Record<Market, string>> = {
	OVER_1_5: '1,5',
	UNDER_1_5: '1,5',
	OVER_2_5: '2,5',
	UNDER_2_5: '2,5',
	OVER_3_5: '3,5',
	UNDER_3_5: '3,5'
};

/**
 * Libellé prêt à afficher : « Arsenal ou match nul », jamais « 1X ».
 * @param home nom de l'équipe à domicile
 * @param away nom de l'équipe à l'extérieur
 */
export function marketLabelFr(market: Market, home: string, away: string): string {
	switch (market) {
		case 'WIN_HOME':
			return `${home} gagne`;
		case 'DRAW':
			return 'Match nul';
		case 'WIN_AWAY':
			return `${away} gagne`;
		case 'DC_HOME_DRAW':
			return `${home} ou match nul`;
		case 'DC_DRAW_AWAY':
			return `Match nul ou ${away}`;
		case 'DC_HOME_AWAY':
			return `${home} ou ${away}`;
		case 'OVER_1_5':
		case 'OVER_2_5':
		case 'OVER_3_5':
			return `Plus de ${SEUIL[market]} buts`;
		case 'UNDER_1_5':
		case 'UNDER_2_5':
		case 'UNDER_3_5':
			return `Moins de ${SEUIL[market]} buts`;
		case 'BTTS_YES':
			return 'Les deux équipes marquent';
		case 'BTTS_NO':
			return 'Au moins une équipe ne marque pas';
	}
}
