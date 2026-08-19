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
	| 'sans_donnee'
	| 'non_cote';

/**
 * Familles de marchés NON couverts qu'on sait NOMMER. Le garde-fou (`uncoveredFamily`,
 * market-map) sait déjà QUELLE famille a déclenché le refus : on l'utilise pour dire
 * « on n'analyse pas les paris sur une mi-temps » au lieu du vague « on ne le couvre
 * pas ». Le TYPE vit ici (partagé) ; les motifs vivent dans market-map (serveur).
 */
export type UncoveredFamily =
	| 'mi_temps'
	| 'buteur'
	| 'corners'
	| 'cartons'
	| 'tirs'
	| 'score_exact'
	| 'handicap';

/** Sujet accordé, inséré dans les phrases (« les paris sur ___ »). */
const SUJET_FAMILLE: Record<UncoveredFamily, string> = {
	mi_temps: 'une mi-temps',
	buteur: 'les buteurs',
	corners: 'les corners',
	cartons: 'les cartons',
	tirs: 'les tirs',
	score_exact: 'le score exact',
	handicap: 'un handicap'
};

/** Phrase autonome (écran de validation, écran de résultat) : famille connue → explicite,
 *  sinon le générique honnête. « On n'analyse pas les paris sur une mi-temps. » */
export function phraseNonCouvert(famille?: UncoveredFamily | null): string {
	return famille
		? `On n'analyse pas les paris sur ${SUJET_FAMILLE[famille]}.`
		: 'Ce marché, on ne le couvre pas.';
}

/** Fragment inséré dans « Non analysé — ___. Non facturé. » (écran de résultat). */
function fragmentNonCouvert(famille?: UncoveredFamily | null): string {
	return famille ? `pari sur ${SUJET_FAMILLE[famille]}` : 'pari qu’on ne couvre pas';
}

/** Fragment par ligne (« Match par match ») : pourquoi CETTE ligne n'est pas analysée. */
const RAISON_LIGNE: Record<RaisonNonAnalyse, string> = {
	commence: 'ce match a déjà commencé',
	hors_couverture: 'pas au catalogue des compétitions',
	hors_fenetre: 'match trop loin dans le temps',
	non_resolu: "on n'a pas retrouvé ce match",
	non_couvert: 'pari qu’on ne couvre pas (buteur, corners…)',
	inconnu: 'lecture incertaine',
	ambigu: 'lecture incertaine',
	sans_donnee: 'pas encore de données pour ce match',
	non_cote: 'ce match n’est pas encore coté'
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
	sans_donnee: { un: "n'a pas encore de données", plur: "n'ont pas encore de données" },
	non_cote: { un: "n'est pas encore coté", plur: 'ne sont pas encore cotés' }
};

export interface LigneStatutIn {
	analysable: boolean;
	retiree: boolean;
	fragile: boolean;
	/** Raison précise quand la ligne n'est pas analysée (sinon absente). */
	raisonNonAnalyse?: RaisonNonAnalyse;
	/** Si non couvert ET famille connue : la nommer (mi-temps, buteurs…). */
	familleNonCouverte?: UncoveredFamily | null;
}

/**
 * Note factuelle par ligne. Jamais de jugement sur une ligne non analysée.
 * `retraitUnique` : « la plus fragile » n'est vrai que s'il n'y a QU'UN retrait ;
 * avec plusieurs retraits, aucun n'est « LA plus » — on dit « fragile », sans superlatif.
 */
export function ligneNote(l: LigneStatutIn, opts?: { retraitUnique?: boolean }): string {
	if (!l.analysable) {
		// Non couvert AVEC famille connue : on NOMME le type de pari (mi-temps, buteurs…)
		// plutôt que le vague « on ne le couvre pas » — le joueur doit comprendre que
		// c'est le TYPE de pari, pas le match.
		if (l.raisonNonAnalyse === 'non_couvert' && l.familleNonCouverte) {
			return `Non analysé — ${fragmentNonCouvert(l.familleNonCouverte)}. Non facturé.`;
		}
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
