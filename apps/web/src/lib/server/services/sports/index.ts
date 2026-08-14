/**
 * services/sports — Données sportives. Règle d'archi n°4 : le fournisseur est
 * encapsulé dans un seul fichier de service. Changer de fournisseur = changer
 * `createSportsService`, jamais la logique métier.
 */
import type { Fixture, Team } from '$lib/types';

export interface SportsDataService {
	/** Calendrier des `days` prochains jours (strictement À VENIR) — dashboard, etc. */
	upcomingFixtures(days?: number): Promise<Fixture[]>;
	/**
	 * Matchs pour la RÉSOLUTION d'un ticket : fenêtre large qui inclut AUSSI les
	 * matchs dont le coup d'envoi est passé (en cours / récemment terminés), pour
	 * distinguer « déjà commencé » de « pas retrouvé ». À ne pas confondre avec
	 * `upcomingFixtures` (strictement à venir).
	 */
	resolutionFixtures(): Promise<Fixture[]>;
	/** Équipes connues, avec leurs alias (actif propriétaire). */
	teams(): Promise<Team[]>;
	/** Résultats terminés depuis une date, pour le règlement des tickets. */
	resultsSince(sinceIso: string): Promise<Fixture[]>;
}

import { FakeSportsData } from './fake';
import { SupabaseSportsData } from './supabase';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { guardFakeService } from '$lib/server/guardFake';

/** Vraies tables Supabase dès qu'elles sont configurées ; sinon jeu factice.
 *  En production, le factice est REFUSÉ : on ne résout jamais les matchs d'un
 *  utilisateur contre une liste de démonstration. */
function createSportsService(): SportsDataService {
	const real = isSupabaseConfigured();
	const impl = real ? new SupabaseSportsData() : new FakeSportsData();
	return guardFakeService('sports (calendrier des matchs)', real, impl);
}

export const sports: SportsDataService = createSportsService();
