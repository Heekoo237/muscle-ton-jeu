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
		: 'Ce pari, on ne le couvre pas.';
}

/** Cause par ligne (« Match par match ») : pourquoi CE match n'a pas d'avis. Phrase
 *  autonome (elle sera suivie de « C'est gratuit. »). Mots de parieur, pas de jargon. */
const RAISON_LIGNE: Record<RaisonNonAnalyse, string> = {
	commence: 'Ce match a déjà commencé',
	hors_couverture: 'Cette compétition, on ne la suit pas encore',
	hors_fenetre: 'Ce match est trop loin dans le temps',
	non_resolu: "On n'a pas retrouvé ce match",
	non_couvert: 'Ce pari, on ne le couvre pas (buteur, corners…)',
	inconnu: "On n'a pas pu lire ce match",
	ambigu: "On n'a pas pu lire ce match",
	sans_donnee: "On n'a pas encore les infos sur ce match",
	non_cote: "Ce match n'est pas encore coté"
};

/** Verbe accordé pour le RÉSUMÉ agrégé (« 1 match a déjà commencé »). Mots de parieur. */
const RAISON_RESUME: Record<RaisonNonAnalyse, { un: string; plur: string }> = {
	commence: { un: 'a déjà commencé', plur: 'ont déjà commencé' },
	hors_couverture: {
		un: "porte sur une compétition qu'on ne suit pas encore",
		plur: "portent sur des compétitions qu'on ne suit pas encore"
	},
	hors_fenetre: { un: 'est trop loin dans le temps', plur: 'sont trop loin dans le temps' },
	non_resolu: { un: "n'a pas été retrouvé", plur: "n'ont pas été retrouvés" },
	non_couvert: { un: 'porte sur un pari qu’on ne couvre pas', plur: 'portent sur un pari qu’on ne couvre pas' },
	inconnu: { un: "n'a pas pu être lu", plur: "n'ont pas pu être lus" },
	ambigu: { un: "n'a pas pu être lu", plur: "n'ont pas pu être lus" },
	sans_donnee: { un: "n'a pas encore d'infos", plur: "n'ont pas encore d'infos" },
	non_cote: { un: "n'est pas encore coté", plur: 'ne sont pas encore cotés' }
};

export interface LigneStatutIn {
	analysable: boolean;
	retiree: boolean;
	fragile: boolean;
	/** GARDÉE mais serrée (juste au-dessus de la barre) : « pas retiré » ≠ « solide ». */
	serree?: boolean;
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
		// c'est le TYPE de pari, pas le match. On finit par « C'est gratuit. » : c'est ce
		// que le joueur veut savoir, dit dans ses mots (pas « non facturé »).
		if (l.raisonNonAnalyse === 'non_couvert' && l.familleNonCouverte) {
			return `On n'analyse pas les paris sur ${SUJET_FAMILLE[l.familleNonCouverte]}. C'est gratuit.`;
		}
		// On connaît la cause exacte : on la dit. Repli sobre si elle manque (vieux ticket).
		const cause = l.raisonNonAnalyse ? RAISON_LIGNE[l.raisonNonAnalyse] : null;
		return cause ? `${cause}. C'est gratuit.` : "On ne l'a pas analysé. C'est gratuit.";
	}
	if (l.retiree) {
		return opts?.retraitUnique
			? 'Retirée du ticket renforcé — sélection la plus fragile.'
			: 'Retirée du ticket renforcé — sélection fragile.';
	}
	if (l.fragile) return 'Ce pari est trop juste.';
	// Gardée mais serrée (juste au-dessus de la barre) : « pas retiré » n'est PAS
	// « solide ». On AVERTIT, jamais un mot qui ressemble à une validation — le terrain
	// lisait « on l'a validée » dans l'ancien « on la garde ». (Marge mesurée, ticket.ts.)
	if (l.serree) return 'Tu peux jouer ce match si tu veux mais c’est fragile.';
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
	return `${n} ${mot} n'ont pas pu être analysés`;
}
