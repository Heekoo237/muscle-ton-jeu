/**
 * ticket.ts — Le moteur déterministe du ticket. AUCUN appel LLM ici.
 *
 * - La probabilité du ticket = produit des probabilités des sélections (brief §2.2).
 * - Le seuil « fragile » est calibré sur données réelles (brief §2.3c) ; ici on
 *   reçoit le seuil, on ne le fixe pas arbitrairement dans le code.
 * - Le ticket renforcé est construit PAR RETRAIT (règle d'or n°3), jamais par
 *   ajout ni remplacement. Plancher à 1 : on peut alléger jusqu'à une seule ligne.
 *   Le SEUL cas interdit est de tout retirer — il reste toujours au moins une ligne.
 *
 * Les probabilités proviennent de la table `predictions` (lues en amont) ;
 * cette couche ne calcule jamais une probabilité de marché.
 */
import type { Selection } from '$lib/types';
import { badgeVisible, fragileThreshold } from './markets-meta';
import { isUnmeasured } from './regime';

/**
 * Plancher absolu du ticket renforcé (règle d'or n°3) : il reste TOUJOURS au moins
 * une ligne. Un plancher plus haut (l'ancien 4) empêchait l'analyse de servir sur
 * les petits tickets : un ticket de 4 avec un fragile ressortait intact. On retire
 * désormais dès qu'il reste une ligne — sauf si TOUTES sont fragiles (on ne vide
 * jamais le ticket : voir `toutesFragiles`).
 */
export const REINFORCED_FLOOR = 1;

/**
 * RÈGLE UNIQUE « analysable » — résolu ≠ analysable. Une sélection compte (calcul,
 * comptage « X matchs sur Y », facturation) SI ET SEULEMENT SI elle est résolue
 * avec certitude ET pourvue d'une probabilité en base. Un match reconnu sans
 * prédiction n'est PAS analysable.
 *
 * Cette fonction est le SEUL endroit où la règle vit. Tout compteur de lignes
 * analysables passe par elle (côté serveur) ou par le booléen `analysable` du VM
 * qu'elle a calculé (côté client). La réimplémenter en ligne ailleurs finirait par
 * diverger — c'est le bug qu'a connu l'écran de validation. Un test statique
 * (`analysable-single-source.test.ts`) échoue si un autre module recouple
 * `etatResolution === 'certain'` à une vérification de `probabilite`.
 */
export function isAnalysable(s: Selection): boolean {
	return s.etatResolution === 'certain' && s.marche !== null && typeof s.probabilite === 'number';
}

/**
 * Sous le seuil de SON marché → candidate au retrait (tous marchés confondus).
 * C'est le classement interne du renforcement, distinct du badge visible.
 */
export function belowThreshold(s: Selection): boolean {
	if (!isAnalysable(s) || s.marche === null) return false;
	return (s.probabilite as number) < fragileThreshold(s.marche, s.seuilFragile);
}

/**
 * Badge rouge : sous le seuil, marché où le badge est autorisé (précision mesurée
 * > ~50 %), ET régime MESURE. En cote seule la précision n'est pas mesurée : jamais
 * de badge rouge (ce serait laisser croire qu'on a mesuré) — la sélection reste
 * candidate au retrait, expliquée par une mention neutre « la moins solide ».
 */
function showsBadge(s: Selection): boolean {
	return belowThreshold(s) && s.marche !== null && badgeVisible(s.marche) && !isUnmeasured(s.source);
}

/**
 * Détecte deux sélections portant sur le même match. Le produit des probabilités
 * suppose l'indépendance : il est FAUX dans ce cas (brief §2.2 note, §10) et doit
 * être traité à part par l'appelant.
 */
export function hasSameFixtureConflict(selections: Selection[]): boolean {
	const seen = new Set<number>();
	for (const s of selections) {
		if (!isAnalysable(s) || s.fixtureId === null) continue;
		if (seen.has(s.fixtureId)) return true;
		seen.add(s.fixtureId);
	}
	return false;
}

/** Produit des probabilités des sélections analysables fournies. */
export function productProbability(selections: Selection[]): number {
	return selections
		.filter(isAnalysable)
		.reduce((acc, s) => acc * (s.probabilite as number), 1);
}

/** Marque `fragile` (badge rouge) selon le seuil PAR MARCHÉ et la visibilité du badge. */
export function markFragile(selections: Selection[]): Selection[] {
	return selections.map((s) => ({ ...s, fragile: showsBadge(s) }));
}

export interface ReinforcedResult {
	/** Sélections après retrait : celles gardées ont retireeDuRenforce=false. */
	selections: Selection[];
	/** Indices (ordre) des sélections retirées. */
	retirees: number[];
	probaTotale: number;
	probaRenforcee: number;
	/** Vrai si rien n'a été retiré → « Rien à retirer. Ton ticket tient debout. » */
	rienARetirer: boolean;
	/**
	 * Vrai si rien n'a été retiré ALORS QUE TOUTES les sélections analysables sont
	 * fragiles : alléger reviendrait à vider le ticket, ce qui est interdit. On le
	 * DIT (« Toutes tes sélections sont fragiles… ») — jamais « ton ticket tient
	 * debout », qui serait le mensonge latent (ticket faible, message rassurant).
	 */
	toutesFragiles: boolean;
	/** Vrai si le produit est faussé par deux sélections sur le même match. */
	conflitMemeMatch: boolean;
}

/**
 * Construit le ticket renforcé par retrait des sélections fragiles, les plus
 * fragiles d'abord. On garde au moins `floor` ligne (plancher à 1). Le seul cas
 * interdit est de tout retirer : si toutes les sélections sont fragiles, on ne
 * retire rien et on l'annonce (`toutesFragiles`) — on ne vide jamais le ticket.
 */
export function buildReinforced(input: Selection[], floor = REINFORCED_FLOOR): ReinforcedResult {
	const selections = markFragile(input);
	const analysables = selections.filter(isAnalysable);
	const probaTotale = productProbability(analysables);

	// Candidats au retrait : sous leur seuil de marché, du plus fragile au moins.
	// (Classement interne : inclut les marchés « sûrs » sans badge — ex. double
	// chance —, qui seront expliqués par une mention neutre à l'affichage.)
	const fragilesTries = analysables
		.filter(belowThreshold)
		.sort((a, b) => (a.probabilite as number) - (b.probabilite as number));

	// TOUT fragile → on ne vide jamais le ticket : on ne retire rien, on l'annonce.
	// Sinon, on retire les fragiles en gardant au moins `floor` ligne(s).
	const toutesFragiles = analysables.length > 0 && fragilesTries.length === analysables.length;
	const removable = toutesFragiles ? 0 : Math.max(0, analysables.length - floor);

	const aRetirer = new Set<number>(fragilesTries.slice(0, removable).map((s) => s.ordre));

	const out = selections.map((s) => ({
		...s,
		retireeDuRenforce: aRetirer.has(s.ordre)
	}));

	const gardees = out.filter((s) => isAnalysable(s) && !s.retireeDuRenforce);
	const probaRenforcee = productProbability(gardees);

	return {
		selections: out,
		retirees: [...aRetirer].sort((a, b) => a - b),
		probaTotale,
		probaRenforcee,
		rienARetirer: aRetirer.size === 0,
		toutesFragiles,
		conflitMemeMatch: hasSameFixtureConflict(analysables)
	};
}

/**
 * Palier de crédits selon le nombre de sélections analysables (PRD §8.1).
 * Au-delà de 20 : blocage (retourne null).
 */
export function creditCost(nbAnalysables: number): number | null {
	if (nbAnalysables > 20) return null; // blocage dur, non contournable
	if (nbAnalysables >= 13) return 3;
	if (nbAnalysables >= 7) return 2;
	if (nbAnalysables >= 2) return 1;
	return 0; // moins de 2 : jamais facturé
}
