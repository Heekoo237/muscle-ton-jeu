/**
 * markets-meta.ts — Règles d'affichage/décision PAR MARCHÉ (miroir runtime de
 * `packages/model/mtj_model/constants.py`). Deux notions DISTINCTES, deux réglages :
 *
 *  1. le SEUIL DE RETRAIT (`FRAGILE_THRESHOLD_BY_MARKET`) — qui devient candidat
 *     au retrait. Gouverne l'ARITHMÉTIQUE (retirer la jambe faible monte la proba
 *     combinée — honnête quel que soit le badge). La Direction 2 (recalibrage par
 *     issue) ne touchera QUE ce réglage.
 *  2. la VISIBILITÉ DU BADGE (`BADGE_VISIBLE`) — qui reçoit le badge rouge « trop
 *     juste ». Gouverne la PRÉTENTION de détection, jamais le retrait.
 *
 * CRITÈRE DU BADGE — le GAIN sur la base, jamais la précision absolue :
 *     badge  ⇔  gain sur la base ≥ 5 pts  ET  taux de marquage ≤ 40 %.
 * L'ancien critère (précision absolue) allumait le badge sur le nul, où la
 * précision 75 % n'est que le taux de base (gain réel +0,0). INTÉRIM : 1X2 et
 * double chance (seuil partagé qui sur-marque) sont en mention neutre jusqu'à la
 * Direction 2 ; le badge revient tout seul dès que le critère est rempli.
 *
 * La source de vérité du seuil de retrait est `predictions.seuil_fragile` (remplie
 * par le pipeline). Les valeurs ici servent de REPLI si la table ne l'a pas.
 */
import type { Market } from '$lib/types';

/** Seuil de RETRAIT par marché (repli ; la table `predictions` fait foi). */
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

/**
 * Badge rouge « trop juste » : gain sur la base ≥ 5 pts ET marquage ≤ 40 %.
 * Chiffres mesurés (fragile.py, seuils actuels) en commentaire — gain · marquage.
 * 1X2 + double chance en `false` (INTÉRIM) : seuil partagé qui sur-marque, badge
 * retiré jusqu'au recalibrage par issue (Direction 2). Miroir de constants.py.
 */
export const BADGE_VISIBLE: Record<Market, boolean> = {
	// Détectent ET restent rares → badge.
	OVER_1_5: true, // +6,1 · 31 %
	OVER_2_5: true, // +10,0 · 31 %
	OVER_3_5: true, // +9,3 · 30 %
	UNDER_1_5: true, // +6,7 · 29 %
	UNDER_2_5: true, // +12,2 · 31 %
	UNDER_3_5: true, // +10,4 · 29 %
	// 1X2 : seuil 0,44 partagé → sur-marque. Neutre jusqu'à Direction 2.
	WIN_HOME: false, // +16,0 mais 51 % marqué
	DRAW: false, // +0,0 · 100 % — le drap
	WIN_AWAY: false, // +8,1 mais 78 % marqué
	// Double chance : seuil 0,74 partagé → sur-marque. Neutre jusqu'à Direction 2.
	DC_HOME_DRAW: false, // +10,9 mais 58 %
	DC_DRAW_AWAY: false, // +6,0 mais 80 %
	DC_HOME_AWAY: false, // +3,6 · 43 %
	// BTTS suspendu : aucune probabilité produite.
	BTTS_YES: false,
	BTTS_NO: false
};

/** Mention neutre pour une sélection retirée sans badge « trop juste ». */
export const NEUTRAL_MENTION = 'la moins solide de ton ticket';

export function fragileThreshold(marche: Market, stored?: number | null): number {
	return typeof stored === 'number' ? stored : FRAGILE_THRESHOLD_BY_MARKET[marche];
}

export function badgeVisible(marche: Market): boolean {
	return BADGE_VISIBLE[marche];
}
