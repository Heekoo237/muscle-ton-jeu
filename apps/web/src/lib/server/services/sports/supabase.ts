/**
 * supabase.ts — Données sportives RÉELLES (calendrier + équipes) depuis Supabase,
 * alimentées par le collecteur/pipeline. La résolution des tickets s'appuie
 * dessus : association floue des noms, restreinte aux 7 prochains jours.
 *
 * La NORMALISATION des noms d'équipes se fait à l'ÉCRITURE (côté pipeline Python,
 * sync.upsert_team) : les alias portent la clé normalisée, donc ici on lit
 * simplement noms + alias, sans re-normaliser à la volée.
 */
import type { SportsDataService } from './index';
import type { Fixture, Team } from '$lib/types';
import { supabaseAdmin } from '$lib/server/supabase';

interface FixtureRow {
	id: number;
	date_utc: string;
	statut: Fixture['statut'];
	score_home: number | null;
	score_away: number | null;
	league_id: number;
	team_home_id: number;
	team_away_id: number;
}

interface TeamRow {
	id: number;
	nom: string;
	aliases: string[] | null;
	league_id: number;
}

export class SupabaseSportsData implements SportsDataService {
	private async teamNames(): Promise<Map<number, string>> {
		const { data, error } = await supabaseAdmin().from('teams').select('id, nom');
		if (error) throw error;
		return new Map((data ?? []).map((t) => [Number(t.id), t.nom as string]));
	}

	async upcomingFixtures(days = 7): Promise<Fixture[]> {
		const nowIso = new Date().toISOString();
		const horizonIso = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
		const { data, error } = await supabaseAdmin()
			.from('fixtures')
			.select('id, date_utc, statut, score_home, score_away, league_id, team_home_id, team_away_id')
			.eq('statut', 'scheduled')
			.gte('date_utc', nowIso)
			.lt('date_utc', horizonIso);
		if (error) throw error;
		const names = await this.teamNames();
		return ((data ?? []) as FixtureRow[]).map((r) => ({
			id: Number(r.id),
			dateUtc: r.date_utc,
			teamHome: names.get(Number(r.team_home_id)) ?? '',
			teamAway: names.get(Number(r.team_away_id)) ?? '',
			leagueId: Number(r.league_id),
			statut: r.statut,
			scoreHome: r.score_home,
			scoreAway: r.score_away
		}));
	}

	async teams(): Promise<Team[]> {
		const { data, error } = await supabaseAdmin()
			.from('teams')
			.select('id, nom, aliases, league_id');
		if (error) throw error;
		return ((data ?? []) as TeamRow[]).map((t) => ({
			id: Number(t.id),
			nom: t.nom,
			aliases: t.aliases ?? [],
			leagueId: Number(t.league_id)
		}));
	}

	async resultsSince(sinceIso: string): Promise<Fixture[]> {
		const { data, error } = await supabaseAdmin()
			.from('fixtures')
			.select('id, date_utc, statut, score_home, score_away, league_id, team_home_id, team_away_id')
			.eq('statut', 'finished')
			.gte('date_utc', sinceIso);
		if (error) throw error;
		const names = await this.teamNames();
		return ((data ?? []) as FixtureRow[]).map((r) => ({
			id: Number(r.id),
			dateUtc: r.date_utc,
			teamHome: names.get(Number(r.team_home_id)) ?? '',
			teamAway: names.get(Number(r.team_away_id)) ?? '',
			leagueId: Number(r.league_id),
			statut: r.statut,
			scoreHome: r.score_home,
			scoreAway: r.score_away
		}));
	}
}
