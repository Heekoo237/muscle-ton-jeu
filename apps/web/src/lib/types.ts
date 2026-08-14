/**
 * types.ts — Types du domaine, partagés serveur/client (affichage).
 * La logique déterministe vit dans lib/server/domain ; ici, seulement les formes.
 */

/** Marchés COUVERTS uniquement (CLAUDE.md « Marchés couverts »). */
export type Market =
	| 'WIN_HOME'
	| 'DRAW'
	| 'WIN_AWAY'
	| 'DC_HOME_DRAW'
	| 'DC_DRAW_AWAY'
	| 'DC_HOME_AWAY'
	| 'OVER_1_5'
	| 'UNDER_1_5'
	| 'OVER_2_5'
	| 'UNDER_2_5'
	| 'OVER_3_5'
	| 'UNDER_3_5'
	| 'BTTS_YES'
	| 'BTTS_NO';

export const COVERED_MARKETS: readonly Market[] = [
	'WIN_HOME',
	'DRAW',
	'WIN_AWAY',
	'DC_HOME_DRAW',
	'DC_DRAW_AWAY',
	'DC_HOME_AWAY',
	'OVER_1_5',
	'UNDER_1_5',
	'OVER_2_5',
	'UNDER_2_5',
	'OVER_3_5',
	'UNDER_3_5',
	'BTTS_YES',
	'BTTS_NO'
];

/** Un marché reconnu (certain), ambigu, ou inconnu. « probable » n'existe pas. */
export type ResolutionState = 'certain' | 'ambigu' | 'inconnu';

export type FixtureStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
export type TicketStatus = 'en_lecture' | 'valide' | 'bloque_credits' | 'analyse' | 'archive';
export type TicketResult = 'en_attente' | 'passe' | 'tombe';

export interface Team {
	id: number;
	nom: string;
	aliases: string[];
	leagueId: number;
	/**
	 * Identifiant de CLUB, partagé par toutes les entités d'un même club à travers
	 * les compétitions (« Reims » L1 + « Stade de Reims » L2 → même clubId). Rempli
	 * par la réconciliation Python. Absent → l'entité est son propre club.
	 */
	clubId?: number | null;
}

export interface Fixture {
	id: number;
	dateUtc: string; // ISO
	teamHome: string;
	teamAway: string;
	leagueId: number;
	statut: FixtureStatus;
	scoreHome: number | null;
	scoreAway: number | null;
}

/**
 * D'où vient une probabilité, du plus au moins mesuré :
 *  - 'odds' / 'model' / 'repli' / 'model_marge_excessive' : RÉGIME MODÈLE, championnat
 *    backtesté — on a mesuré la calibration, le texte peut l'évoquer.
 *  - 'cote_seule'  : championnat que le fournisseur price mais qu'on n'a PAS backtesté —
 *    cote dé-vigée seule, confiance basse, « d'après les cotes », aucune mesure.
 *  - 'cote_derivee': dérivée arithmétiquement d'une cote (double chance = P(1)+P(X)…).
 *    Distincte de 'cote_seule' pour SÉPARER, à la calibration, le coté du déduit.
 */
export type PredictionSource =
	| 'odds'
	| 'model'
	| 'repli'
	| 'model_marge_excessive'
	| 'cote_seule'
	| 'cote_derivee';

/** Probabilité lue dans la table `predictions` — jamais calculée en temps réel. */
export interface Prediction {
	fixtureId: number;
	marche: Market;
	probabilite: number; // 0..1
	confiance: number; // 0..1
	/** Seuil de fragilité applicable à ce marché (calibré, stocké en table). */
	seuilFragile: number | null;
	/** D'où vient la probabilité — voir PredictionSource. Décide le régime du texte. */
	source?: PredictionSource;
}

export interface Selection {
	/** Index d'appariement 01..20, attribué une fois pour tout le ticket. */
	ordre: number;
	texteBrut: string;
	fixtureId: number | null;
	/** Match reconnu, prêt à afficher (« Arsenal – Liverpool »). */
	matchLabel: string;
	marche: Market | null;
	etatResolution: ResolutionState;
	/**
	 * Pourquoi la ligne n'est pas certaine :
	 *  - 'non_couvert'     : marché hors couverture (buteur, mi-temps…) — gardé.
	 *  - 'hors_couverture' : championnat vraiment absent du catalogue (aucun candidat) — gardé.
	 *  - 'non_resolu'      : match pas retrouvé alors qu'un candidat existe (alias manquant).
	 *  - 'hors_fenetre'    : équipes reconnues, mais match hors des 7 prochains jours.
	 *  - 'ambigu'          : plusieurs lectures possibles (seuil de buts absent).
	 *  - 'inconnu'         : on n'a pas su lire (match ou pari) — à corriger.
	 */
	raison?:
		| 'non_couvert'
		| 'hors_couverture'
		| 'non_resolu'
		| 'hors_fenetre'
		| 'inconnu'
		| 'ambigu';
	/** Cas ambigu : marchés proposés au choix (jamais deviné). */
	candidates?: Market[];
	coteSaisie: number | null;
	probabilite: number | null; // copiée depuis predictions
	/** Seuil de fragilité du marché (copié depuis predictions) ; null si non lu. */
	seuilFragile: number | null;
	/** Source de la probabilité (copiée depuis predictions) — décide le régime du texte. */
	source?: PredictionSource | null;
	/** Marquée fragile ET badge rouge autorisé sur ce marché (1X2, plus/moins 2,5, etc.). */
	fragile: boolean;
	retireeDuRenforce: boolean;
	/** Libellé français du marché prêt à afficher (« Arsenal ou match nul »). */
	libelleFr: string;
}

export interface Ticket {
	id: number;
	statut: TicketStatus;
	resultat: TicketResult | null;
	nbSelections: number;
	coutCredits: number;
	probaTotale: number | null;
	probaRenforcee: number | null;
	selections: Selection[];
}

/* ---- Vues d'affichage du module de comparaison ---- */

export interface LineVM {
	ordre: number;
	index: string;
	matchLabel: string;
	libelleFr: string;
	cote: number | null;
	/** Badge rouge « fragile » (marchés à forte précision : 1X2, plus/moins 2,5, plus 3,5). */
	fragile: boolean;
	retiree: boolean;
	/** Retirée sans badge rouge (double chance, plus de 1,5) → mention neutre, jamais « fragile ». */
	mentionNeutre: boolean;
	analysable: boolean;
	/** Probabilité de la sélection (table predictions), en % ; null si non analysée. */
	probabilitePct: number | null;
}

/** Explication d'une sélection retirée (texte deux niveaux, second niveau). */
export interface ExplicationVM {
	ordre: number;
	matchLabel: string;
	libelleFr: string;
	/** Badge rouge (fragile) → ton « risqué » ; sinon mention neutre. */
	avecBadge: boolean;
	texte: string;
}

export interface ResultVM {
	lignes: LineVM[];
	probaTotalePct: number;
	probaRenforceePct: number;
	nbRetirees: number;
	/** Niveau 1 : une phrase sur le ticket entier. */
	synthese: string;
	/** Niveau 2 : une explication par sélection retirée (peut être vide en repli). */
	explications: ExplicationVM[];
	rienARetirer: boolean;
	conflitMemeMatch: boolean;
}

/* ---- Bandeau d'historique (écran de résultat) ---- */

export interface HistoryItem {
	matchLabel: string;
	fragile: boolean;
	/** true = la sélection est passée ; false = elle est tombée. */
	passe: boolean;
}
