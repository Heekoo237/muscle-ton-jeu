/**
 * markets-meta.ts — Règles d'affichage/décision PAR MARCHÉ, calibrées au backtest.
 *
 * Deux choses distinctes (décision produit du modèle statistique) :
 *  - le SEUIL de fragilité, calibré au point de fonctionnement 30 % ;
 *  - la VISIBILITÉ du badge rouge « fragile ».
 *
 * La source de vérité du seuil est la colonne `predictions.seuil_fragile` (remplie
 * par le pipeline). Les valeurs ici servent de REPLI si la table ne l'a pas.
 *
 * Sur les marchés « sûrs » (double chance, plus de 1,5), la précision du signal
 * est plate (~28 %) : on n'y met JAMAIS de badge rouge. Si le renforcement retire
 * une de ces sélections, on l'explique par une mention neutre — jamais « fragile ».
 */
import type { Market } from '$lib/types';

/** Seuil de fragilité par marché (repli ; la table `predictions` fait foi). */
export const FRAGILE_THRESHOLD_BY_MARKET: Record<Market, number> = {
	WIN_HOME: 0.44,
	DRAW: 0.44,
	WIN_AWAY: 0.44,
	DC_HOME_DRAW: 0.74,
	DC_DRAW_AWAY: 0.74,
	DC_HOME_AWAY: 0.74,
	OVER_1_5: 0.72,
	UNDER_1_5: 0.18,
	OVER_2_5: 0.48,
	UNDER_2_5: 0.42,
	OVER_3_5: 0.24,
	UNDER_3_5: 0.63,
	// BTTS suspendu : aucune probabilité produite, donc jamais analysable ici.
	BTTS_YES: 0.5,
	BTTS_NO: 0.5
};

/** Badge rouge « fragile » visible uniquement là où la précision dépasse ~50 %. */
export const BADGE_VISIBLE: Record<Market, boolean> = {
	WIN_HOME: true,
	DRAW: true,
	WIN_AWAY: true,
	OVER_2_5: true,
	UNDER_2_5: true,
	OVER_3_5: true,
	UNDER_1_5: true,
	// Marchés « sûrs » : précision plate → jamais de badge rouge, mention neutre.
	DC_HOME_DRAW: false,
	DC_DRAW_AWAY: false,
	DC_HOME_AWAY: false,
	OVER_1_5: false,
	UNDER_3_5: false,
	BTTS_YES: false,
	BTTS_NO: false
};

/** Mention neutre pour une sélection retirée sans badge rouge. */
export const NEUTRAL_MENTION = 'la moins solide de ton ticket';

export function fragileThreshold(marche: Market, stored?: number | null): number {
	return typeof stored === 'number' ? stored : FRAGILE_THRESHOLD_BY_MARKET[marche];
}

export function badgeVisible(marche: Market): boolean {
	return BADGE_VISIBLE[marche];
}
