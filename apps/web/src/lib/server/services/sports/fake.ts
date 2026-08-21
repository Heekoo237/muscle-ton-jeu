import type { SportsDataService, CoverageEntry } from './index';
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

	async fixtureDates(ids: number[]): Promise<Map<number, number>> {
		const out = new Map<number, number>();
		for (const f of fakeFixtures()) if (ids.includes(f.id)) out.set(f.id, Date.parse(f.dateUtc));
		return out;
	}

	async coveredCompetitions(): Promise<CoverageEntry[]> {
		// Jeu factice représentatif : quelques ligues mesurées + une coupe active et
		// une inactive, pour exercer la page /couverture en local.
		return [
			{ nom: 'Premier League', pays: 'Angleterre', regime: 'modele', actif: true },
			{ nom: 'Ligue 1', pays: 'France', regime: 'modele', actif: true },
			{ nom: 'La Liga', pays: 'Espagne', regime: 'modele', actif: true },
			{ nom: 'Serie A', pays: 'Italie', regime: 'modele', actif: false },
			{ nom: 'Coupe de la Ligue anglaise', pays: 'Angleterre', regime: 'cote_seule', actif: true },
			{ nom: 'Copa Libertadores', pays: 'Amérique du Sud', regime: 'cote_seule', actif: true },
			{ nom: 'Coupe du Roi', pays: 'Espagne', regime: 'cote_seule', actif: false }
		];
	}
}
