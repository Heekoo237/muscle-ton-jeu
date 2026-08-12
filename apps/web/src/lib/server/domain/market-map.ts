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
 * Marchés explicitement NON couverts (CLAUDE.md). Reconnus pour pouvoir dire
 * « non analysé · non facturé », jamais pour produire une probabilité.
 */
const UNCOVERED = [
	/\bcorner/,
	/\bcarton/,
	/\btir(s)?\b/,
	/\bbuteur\b/,
	/\bmi-?temps\b/,
	/\b1mt\b/,
	/\bht\/ft\b/,
	/\bscore exact\b/,
	/\bhandicap\b/
];

export function resolveMarket(notation: string): MarketResolution {
	const n = normalize(notation);
	if (n in TABLE) {
		return { state: 'certain', market: TABLE[n] };
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
