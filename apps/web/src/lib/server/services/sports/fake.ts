import type { SportsDataService } from './index';
import type { Fixture, Team } from '$lib/types';
import { FAKE_TEAMS, fakeFixtures } from '$lib/server/fixtures/sports';
import {
	ANALYSIS_WINDOW_DAYS,
	RESOLUTION_HORIZON_DAYS,
	RESOLUTION_LOOKBACK_HOURS
} from '$lib/server/domain/window';

export class FakeSportsData implements SportsDataService {
	async upcomingFixtures(days = ANALYSIS_WINDOW_DAYS): Promise<Fixture[]> {
		const now = Date.now();
		const horizon = now + days * 24 * 3600 * 1000;
		return fakeFixtures().filter((f) => {
			const t = Date.parse(f.dateUtc);
			return t >= now && t <= horizon;
		});
	}

	async resolutionFixtures(): Promise<Fixture[]> {
		const now = Date.now();
		const from = now - RESOLUTION_LOOKBACK_HOURS * 3600 * 1000;
		const to = now + RESOLUTION_HORIZON_DAYS * 24 * 3600 * 1000;
		return fakeFixtures().filter((f) => {
			const t = Date.parse(f.dateUtc);
			return t >= from && t < to;
		});
	}

	async teams(): Promise<Team[]> {
		return FAKE_TEAMS;
	}

	async resultsSince(): Promise<Fixture[]> {
		return []; // aucun résultat terminé dans le jeu factice
	}
}
