/**
 * services/predictions — LIT la table `predictions`. Règles d'archi n°1 et n°2 :
 * toute probabilité vient de cette table, remplie par le pipeline nocturne ; le
 * chemin temps réel ne calcule JAMAIS de probabilité, il lit.
 */
import type { Market, Prediction } from '$lib/types';

export interface PredictionsService {
	/** Probabilité stockée pour (match, marché), ou null si absente. */
	get(fixtureId: number, marche: Market): Promise<Prediction | null>;
	/** Toutes les probabilités stockées d'un match. */
	forFixture(fixtureId: number): Promise<Prediction[]>;
	/**
	 * Combien de matchs, parmi `fixtureIds`, ont au moins une probabilité en table
	 * (donc « analysés en ce moment »). Sert au compteur honnête du dashboard quand
	 * aucune lecture du jour n'est disponible. Compte des matchs DISTINCTS.
	 */
	countAnalysees(fixtureIds: number[]): Promise<number>;
}

import { FakePredictions } from './fake';
import { SupabasePredictions } from './supabase';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { guardFakeService } from '$lib/server/guardFake';

/** Lecture réelle dès que Supabase est configuré ; sinon maquette déterministe.
 *  En production, le factice est REFUSÉ : une probabilité affichée vient TOUJOURS
 *  de la table `predictions`, jamais d'une maquette (règle d'or n°1). */
function createPredictionsService(): PredictionsService {
	const real = isSupabaseConfigured();
	const impl = real ? new SupabasePredictions() : new FakePredictions();
	return guardFakeService('predictions (probabilités)', real, impl);
}

export const predictions: PredictionsService = createPredictionsService();
