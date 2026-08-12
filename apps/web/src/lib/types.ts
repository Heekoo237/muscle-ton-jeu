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
	marche: Market | null;
	etatResolution: ResolutionState;
	coteSaisie: number | null;
	probabilite: number | null; // copiée depuis predictions
	fragile: boolean;
	retireeDuRenforce: boolean;
	/** Libellé français prêt à afficher (« Arsenal ou match nul »). */
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
