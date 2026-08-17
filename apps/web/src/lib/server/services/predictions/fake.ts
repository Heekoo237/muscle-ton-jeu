import type { PredictionsService } from './index';
import type { Market, Prediction } from '$lib/types';
import { COVERED_MARKETS } from '$lib/types';
import { FRAGILE_THRESHOLD_BY_MARKET } from '$lib/server/domain/markets-meta';

/**
 * Probabilités factices DÉTERMINISTES : mêmes (match, marché) → même valeur,
 * comme une lecture en table. Le vrai pipeline (Session 7) les remplace ; le
 * chemin temps réel, lui, ne change pas — il lit toujours.
 */
function seeded(fixtureId: number, marche: Market): number {
	let h = 2166136261 ^ fixtureId;
	for (let i = 0; i < marche.length; i++) {
		h = Math.imul(h ^ marche.charCodeAt(i), 16777619);
	}
	// [0.30, 0.88], stable
	const unit = ((h >>> 0) % 1000) / 1000;
	return Math.round((0.3 + unit * 0.58) * 1000) / 1000;
}

export class FakePredictions implements PredictionsService {
	async get(fixtureId: number, marche: Market): Promise<Prediction | null> {
		return {
			fixtureId,
			marche,
			probabilite: seeded(fixtureId, marche),
			confiance: 0.8,
			seuilFragile: FRAGILE_THRESHOLD_BY_MARKET[marche],
			source: 'model'
		};
	}

	async forFixture(fixtureId: number): Promise<Prediction[]> {
		return COVERED_MARKETS.map((marche) => ({
			fixtureId,
			marche,
			probabilite: seeded(fixtureId, marche),
			confiance: 0.8,
			seuilFragile: FRAGILE_THRESHOLD_BY_MARKET[marche],
			source: 'model' as const
		}));
	}

	async countAnalysees(fixtureIds: number[]): Promise<number> {
		// En factice, tout match a des probabilités (forFixture en renvoie toujours).
		return fixtureIds.length;
	}
}
