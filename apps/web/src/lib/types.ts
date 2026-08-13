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

/** Probabilité lue dans la table `predictions` — jamais calculée en temps réel. */
export interface Prediction {
	fixtureId: number;
	marche: Market;
	probabilite: number; // 0..1
	confiance: number; // 0..1
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
	/** Pourquoi la ligne n'est pas certaine (non couvert, inconnu, ambigu). */
	raison?: 'non_couvert' | 'inconnu' | 'ambigu';
	/** Cas ambigu : marchés proposés au choix (jamais deviné). */
	candidates?: Market[];
	coteSaisie: number | null;
	probabilite: number | null; // copiée depuis predictions
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
	fragile: boolean;
	retiree: boolean;
	analysable: boolean;
}

export interface ResultVM {
	lignes: LineVM[];
	probaTotalePct: number;
	probaRenforceePct: number;
	nbRetirees: number;
	texte: string;
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
