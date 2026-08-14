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
}

import { FakePredictions } from './fake';
import { SupabasePredictions } from './supabase';
import { isSupabaseConfigured } from '$lib/server/supabase';

/** Lecture réelle dès que Supabase est configuré ; sinon maquette déterministe. */
function createPredictionsService(): PredictionsService {
	return isSupabaseConfigured() ? new SupabasePredictions() : new FakePredictions();
}

export const predictions: PredictionsService = createPredictionsService();
