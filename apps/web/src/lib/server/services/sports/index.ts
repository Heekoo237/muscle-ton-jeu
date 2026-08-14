/**
 * services/sports — Données sportives. Règle d'archi n°4 : le fournisseur est
 * encapsulé dans un seul fichier de service. Changer de fournisseur = changer
 * `createSportsService`, jamais la logique métier.
 */
import type { Fixture, Team } from '$lib/types';

export interface SportsDataService {
	/** Calendrier des `days` prochains jours — restreint la résolution des matchs. */
	upcomingFixtures(days?: number): Promise<Fixture[]>;
	/** Équipes connues, avec leurs alias (actif propriétaire). */
	teams(): Promise<Team[]>;
	/** Résultats terminés depuis une date, pour le règlement des tickets. */
	resultsSince(sinceIso: string): Promise<Fixture[]>;
}

import { FakeSportsData } from './fake';
import { SupabaseSportsData } from './supabase';
import { isSupabaseConfigured } from '$lib/server/supabase';

/** Vraies tables Supabase dès qu'elles sont configurées ; sinon jeu factice. */
function createSportsService(): SportsDataService {
	return isSupabaseConfigured() ? new SupabaseSportsData() : new FakeSportsData();
}

export const sports: SportsDataService = createSportsService();
