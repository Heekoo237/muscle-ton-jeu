/**
 * services/stats — Faits DESCRIPTIFS pour éclairer la rédaction : forme récente,
 * buts marqués/encaissés à domicile et à l'extérieur, confrontations directes.
 *
 * Règle : on LIT ces faits depuis `fixtures` (matchs terminés déjà en base), on
 * ne calcule JAMAIS de probabilité dans le chemin temps réel. Ce sont des faits
 * bruts (résultats, buts) — pas une analyse, pas un pronostic. Le rédacteur les
 * transforme en phrases ; il n'en invente aucun (règle d'or n°1).
 */
export type Issue = 'V' | 'N' | 'D';

export interface FaitsEquipe {
	nom: string;
	/** 5 derniers résultats, plus récent d'abord, du point de vue de l'équipe. */
	forme: Issue[];
	/** Moyennes de buts (null si trop peu de matchs pour être honnête). */
	butsMarquesDom: number | null;
	butsEncaissesDom: number | null;
	butsMarquesExt: number | null;
	butsEncaissesExt: number | null;
	joues: number;
}

export interface FaitsMatch {
	fixtureId: number;
	home: FaitsEquipe;
	away: FaitsEquipe;
	/** Confrontations directes récentes, du point de vue du domicile ; [] si aucune. */
	h2h: Issue[];
}

export interface StatsService {
	/** Faits descriptifs pour un lot de matchs (clé = fixtureId). */
	forFixtures(fixtureIds: number[]): Promise<Map<number, FaitsMatch>>;
}

import { FakeStats } from './fake';
import { SupabaseStats } from './supabase';
import { isSupabaseConfigured } from '$lib/server/supabase';

/** Vrais faits depuis la base dès que Supabase est configuré ; sinon faits factices.
 *  Pas de garde-fou prod ici : sans faits, le rédacteur écrit une explication plus
 *  pauvre mais jamais fausse — ce n'est pas un risque de règle d'or. */
function createStatsService(): StatsService {
	return isSupabaseConfigured() ? new SupabaseStats() : new FakeStats();
}

export const stats: StatsService = createStatsService();
