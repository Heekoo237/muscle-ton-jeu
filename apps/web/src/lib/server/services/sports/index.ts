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

/** ← Point de bascule unique vers le vrai fournisseur (Session 8). */
function createSportsService(): SportsDataService {
	return new FakeSportsData();
}

export const sports: SportsDataService = createSportsService();
