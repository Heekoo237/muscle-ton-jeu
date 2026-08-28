/**
 * serreMesure.ts — L'état « serré » TIENT-IL la mesure ? Compare, sur les lignes
 * GARDÉES et réglées, le taux de CHUTE des « serrées » à celui des « solides ».
 *
 * La question du terrain : des lignes marquées « serré » tombent — est-ce le hasard
 * (un serré à 55 % tombe presque une fois sur deux, c'est ce qu'il annonce) ou notre
 * marquage ne sépare-t-il RIEN ? Si les serrées tombent NETTEMENT plus que les solides,
 * la mention est justifiée et il suffit de mieux la dire. Si l'écart est nul, c'est
 * l'état lui-même qu'il faut revoir. On MESURE, on ne suppose pas.
 *
 * Règlement déterministe (settleMarket), jamais de LLM (règle d'or n°1). Unité =
 * DÉCISION de marché (match × marché) parmi les lignes gardées, dédoublonnée : serré
 * est déterministe par (match, marché), compter par ticket corrélerait les observations.
 */

/** Une décision GARDÉE et réglée : était-elle serrée, et est-elle tombée ? */
export interface SerreMesureInput {
	serre: boolean; // serré (juste au-dessus de la barre) ; sinon solide
	tombe: boolean; // le pari a échoué
}

export interface SerreMesureStats {
	serreesReglees: number;
	serreesTombees: number;
	solidesReglees: number;
	solidesTombees: number;
	/** Taux de CHUTE des serrées (0..1), ou null si aucune réglée. */
	tauxChuteSerre: number | null;
	/** Taux de CHUTE des solides (0..1), ou null si aucune réglée. */
	tauxChuteSolide: number | null;
	/** Écart serré − solide (points de proba, 0..1) ; null si un seau est vide. Un écart
	 *  POSITIF net = notre marquage sépare vraiment ; ~0 = l'état ne dit rien. */
	ecart: number | null;
	/** Assez de serrées réglées pour ne pas commenter du bruit (seau rare = la contrainte). */
	assez: boolean;
}

/** Sous ce nombre de serrées réglées, l'écart est du bruit — on donne les comptes, pas de verdict. */
export const SERRE_VOLUME_MIN = 20;

export function serreMesureStats(rows: SerreMesureInput[]): SerreMesureStats {
	let sr = 0,
		st = 0,
		or = 0,
		ot = 0;
	for (const r of rows) {
		if (r.serre) {
			sr++;
			if (r.tombe) st++;
		} else {
			or++;
			if (r.tombe) ot++;
		}
	}
	const tauxChuteSerre = sr > 0 ? st / sr : null;
	const tauxChuteSolide = or > 0 ? ot / or : null;
	return {
		serreesReglees: sr,
		serreesTombees: st,
		solidesReglees: or,
		solidesTombees: ot,
		tauxChuteSerre,
		tauxChuteSolide,
		ecart:
			tauxChuteSerre !== null && tauxChuteSolide !== null
				? tauxChuteSerre - tauxChuteSolide
				: null,
		assez: sr >= SERRE_VOLUME_MIN
	};
}
