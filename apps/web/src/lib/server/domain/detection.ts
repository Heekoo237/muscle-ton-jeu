/**
 * detection.ts — Le chiffre PUBLIC qu'on affichera un jour : la capacité de DÉTECTION
 * du marquage fragile, au niveau MATCH. Jamais un taux de réussite de pari (voir
 * CLAUDE.md, « Historique public — pas de taux de réussite »).
 *
 * « Sur 100 matchs qu'on a marqués trop justes, X sont tombés. Sur ceux qu'on a
 *  laissés, seulement Y. »
 *
 * Fonction PURE (testable sans base). L'unité est la DÉCISION de marché (un match ×
 * un marché), pas la sélection par ticket : le flag fragile est déterministe par
 * (match, marché), donc compter chaque ticket corrélerait les observations et
 * gonflerait artificiellement l'échantillon. Le store dédoublonne AVANT d'appeler ici.
 */

/**
 * Seuil de volume avant tout affichage : 30 matchs FRAGILES réglés (le seau RARE,
 * qui borne la précision — pas 30 tickets). En dessous, le chiffre est du bruit
 * présenté comme une preuve. Garde-fou consigné dans CLAUDE.md.
 */
export const SEUIL_DETECTION_FRAGILES = 30;

export interface DetectionInput {
	/** La décision de marché était-elle marquée fragile ? */
	fragile: boolean;
	/** Le match est-il tombé sur ce marché (issue perdante) ? */
	tombe: boolean;
}

export interface DetectionStats {
	fragilesRegles: number;
	fragilesTombes: number;
	solidesRegles: number;
	solidesTombes: number;
	/** Taux de CHUTE des matchs marqués fragiles (0..1), ou null si aucun. */
	tauxChuteFragile: number | null;
	/** Taux de CHUTE des matchs laissés (0..1), ou null si aucun. */
	tauxChuteSolide: number | null;
	/** Assez de matchs fragiles réglés pour ne pas montrer du bruit. */
	volumeSuffisant: boolean;
}

/** Agrège des décisions de marché déjà DÉDOUBLONNÉES et réglées. */
export function detectionStats(rows: DetectionInput[]): DetectionStats {
	let fr = 0;
	let ft = 0;
	let sr = 0;
	let st = 0;
	for (const r of rows) {
		if (r.fragile) {
			fr += 1;
			if (r.tombe) ft += 1;
		} else {
			sr += 1;
			if (r.tombe) st += 1;
		}
	}
	return {
		fragilesRegles: fr,
		fragilesTombes: ft,
		solidesRegles: sr,
		solidesTombes: st,
		tauxChuteFragile: fr > 0 ? ft / fr : null,
		tauxChuteSolide: sr > 0 ? st / sr : null,
		volumeSuffisant: fr >= SEUIL_DETECTION_FRAGILES
	};
}
