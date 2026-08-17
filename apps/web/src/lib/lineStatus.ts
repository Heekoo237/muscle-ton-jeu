/**
 * lineStatus.ts — Note d'affichage d'une ligne de ticket, partagée par l'écran de
 * résultat et le détail d'historique (même règle des deux côtés).
 *
 * La règle « analysable » (résolu ≠ analysable) vit dans UNE fonction, `isAnalysable`
 * (server/domain/ticket.ts), et est tranchée UNE fois côté serveur : le VM porte le
 * booléen `analysable` déjà calculé. Ici on ne re-dérive PAS la règle — on lit le
 * booléen. Une sélection non analysée ne porte AUCUN jugement, ni « solide », ni
 * « fragile ». Juste « non analysé » — MAIS avec la VRAIE raison : on connaît la cause
 * exacte (déjà commencé, hors catalogue…), on ne sert jamais une raison approximative.
 */

/**
 * Raison précise de non-analyse. Reprend les raisons de résolution (`Selection.raison`)
 * + `sans_donnee` : ligne résolue mais sans probabilité en base (pas encore de données).
 */
export type RaisonNonAnalyse =
	| 'commence'
	| 'hors_couverture'
	| 'hors_fenetre'
	| 'non_resolu'
	| 'non_couvert'
	| 'inconnu'
	| 'ambigu'
	| 'sans_donnee';

/** Fragment par ligne (« Match par match ») : pourquoi CETTE ligne n'est pas analysée. */
const RAISON_LIGNE: Record<RaisonNonAnalyse, string> = {
	commence: 'ce match a déjà commencé',
	hors_couverture: 'pas au catalogue des compétitions',
	hors_fenetre: 'match trop loin dans le temps',
	non_resolu: "on n'a pas retrouvé ce match",
	non_couvert: 'pari qu’on ne couvre pas (buteur, corners…)',
	inconnu: 'lecture incertaine',
	ambigu: 'lecture incertaine',
	sans_donnee: 'pas encore de données pour ce match'
};

/** Verbe accordé pour le RÉSUMÉ agrégé (« 1 match a déjà commencé »). */
const RAISON_RESUME: Record<RaisonNonAnalyse, { un: string; plur: string }> = {
	commence: { un: 'a déjà commencé', plur: 'ont déjà commencé' },
	hors_couverture: { un: "n'est pas au catalogue", plur: 'ne sont pas au catalogue' },
	hors_fenetre: { un: 'est trop loin dans le temps', plur: 'sont trop loin dans le temps' },
	non_resolu: { un: "n'a pas été retrouvé", plur: "n'ont pas été retrouvés" },
	non_couvert: { un: 'porte sur un pari qu’on ne couvre pas', plur: 'portent sur un pari qu’on ne couvre pas' },
	inconnu: { un: "n'a pas pu être lu", plur: "n'ont pas pu être lus" },
	ambigu: { un: "n'a pas pu être lu", plur: "n'ont pas pu être lus" },
	sans_donnee: { un: "n'a pas encore de données", plur: "n'ont pas encore de données" }
};

export interface LigneStatutIn {
	analysable: boolean;
	retiree: boolean;
	fragile: boolean;
	/** Raison précise quand la ligne n'est pas analysée (sinon absente). */
	raisonNonAnalyse?: RaisonNonAnalyse;
}

/**
 * Note factuelle par ligne. Jamais de jugement sur une ligne non analysée.
 * `retraitUnique` : « la plus fragile » n'est vrai que s'il n'y a QU'UN retrait ;
 * avec plusieurs retraits, aucun n'est « LA plus » — on dit « fragile », sans superlatif.
 */
export function ligneNote(l: LigneStatutIn, opts?: { retraitUnique?: boolean }): string {
	if (!l.analysable) {
		// On connaît la cause exacte : on la dit. Repli sobre si elle manque (vieux ticket).
		const cause = l.raisonNonAnalyse ? RAISON_LIGNE[l.raisonNonAnalyse] : null;
		return cause ? `Non analysé — ${cause}. Non facturé.` : 'Non analysé — non facturé.';
	}
	if (l.retiree) {
		return opts?.retraitUnique
			? 'Retirée du ticket renforcé — sélection la plus fragile.'
			: 'Retirée du ticket renforcé — sélection fragile.';
	}
	if (l.fragile) return 'Ce pari est trop juste.';
	return 'Sélection solide.';
}

/**
 * Résumé agrégé des lignes NON analysées, pour la mention sous le pourcentage. Reflète
 * la VRAIE raison : une seule cause → message précis (« 1 match a déjà commencé ») ;
 * plusieurs causes → compte neutre (« 3 matchs ne sont pas analysés »). Jamais une
 * raison approximative quand on connaît la vraie. Renvoie '' si tout est analysé.
 */
export function resumeNonAnalyse(raisons: RaisonNonAnalyse[]): string {
	const n = raisons.length;
	if (n === 0) return '';
	const mot = n > 1 ? 'matchs' : 'match';
	const uniques = new Set(raisons);
	if (uniques.size === 1) {
		const forme = RAISON_RESUME[[...uniques][0]];
		return `${n} ${mot} ${n > 1 ? forme.plur : forme.un}`;
	}
	return `${n} ${mot} ne sont pas analysés`;
}
