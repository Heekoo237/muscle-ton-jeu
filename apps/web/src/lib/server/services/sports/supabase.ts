/**
 * supabase.ts — Données sportives RÉELLES (calendrier + équipes) depuis Supabase,
 * alimentées par le collecteur/pipeline. La résolution des tickets s'appuie
 * dessus : association floue des noms, restreinte aux 7 prochains jours.
 *
 * La NORMALISATION des noms d'équipes se fait à l'ÉCRITURE (côté pipeline Python,
 * sync.upsert_team) : les alias portent la clé normalisée, donc ici on lit
 * simplement noms + alias, sans re-normaliser à la volée.
 */
import type { SportsDataService, CoverageEntry } from './index';
import type { Fixture, Team } from '$lib/types';
import { supabaseAdmin } from '$lib/server/supabase';
import { selectAll } from '$lib/server/supabasePage';
import {
	ANALYSIS_WINDOW_DAYS,
	RESOLUTION_HORIZON_DAYS,
	RESOLUTION_LOOKBACK_HOURS
} from '$lib/server/domain/window';

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
	club_id: number | null;
}

export class SupabaseSportsData implements SportsDataService {
	private async teamNames(): Promise<Map<number, string>> {
		// TOUTES les équipes, paginées : la table dépasse le plafond de 1000 lignes de
		// PostgREST. Sans ça, ~47 équipes disparaissaient de la résolution (leur match
		// ressortait non_resolu, nom d'équipe vide). Ordre stable obligatoire (voir selectAll).
		const rows = await selectAll<{ id: number; nom: string }>(() =>
			supabaseAdmin().from('teams').select('id, nom').order('id', { ascending: true })
		);
		return new Map(rows.map((t) => [Number(t.id), t.nom]));
	}

	async upcomingFixtures(days = ANALYSIS_WINDOW_DAYS): Promise<Fixture[]> {
		const nowIso = new Date().toISOString();
		const horizonIso = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
		// Paginé : une fenêtre de plusieurs semaines sur ~44 compétitions dépasse 1000
		// fixtures. Sans pagination, le BOUT LOINTAIN de la fenêtre était coupé — des
		// refus qu'on mettait à tort sur le compte de l'horizon fournisseur.
		const data = await selectAll<FixtureRow>(() =>
			supabaseAdmin()
				.from('fixtures')
				.select('id, date_utc, statut, score_home, score_away, league_id, team_home_id, team_away_id')
				.eq('statut', 'scheduled')
				.gte('date_utc', nowIso)
				.lt('date_utc', horizonIso)
				// ORDRE DÉTERMINISTE (date puis id) : nécessaire à la pagination ET au
				// « fixtures[0] » stable (sinon l'analyse du jour sautait d'un match à l'autre).
				.order('date_utc', { ascending: true })
				.order('id', { ascending: true })
		);
		const names = await this.teamNames();
		return ((data ?? []) as FixtureRow[]).map((r) => ({
			id: Number(r.id),
			dateUtc: r.date_utc,
			teamHome: names.get(Number(r.team_home_id)) ?? '',
			teamAway: names.get(Number(r.team_away_id)) ?? '',
			teamHomeId: Number(r.team_home_id),
			teamAwayId: Number(r.team_away_id),
			leagueId: Number(r.league_id),
			statut: r.statut,
			scoreHome: r.score_home,
			scoreAway: r.score_away
		}));
	}

	async resolutionFixtures(): Promise<Fixture[]> {
		const now = Date.now();
		const fromIso = new Date(now - RESOLUTION_LOOKBACK_HOURS * 3600 * 1000).toISOString();
		const toIso = new Date(now + RESOLUTION_HORIZON_DAYS * 24 * 3600 * 1000).toISOString();
		// On inclut les matchs en cours (scheduled, date passée) ET récemment terminés,
		// pour pouvoir dire « déjà commencé » plutôt que « pas retrouvé ». Paginé : la
		// fenêtre de 60 j sur ~44 compétitions dépasse 1000 fixtures — le match résolu
		// pouvait être hors des 1000 renvoyées (bug du fixture qui n'arrive jamais).
		const data = await selectAll<FixtureRow>(() =>
			supabaseAdmin()
				.from('fixtures')
				.select('id, date_utc, statut, score_home, score_away, league_id, team_home_id, team_away_id')
				.in('statut', ['scheduled', 'finished'])
				.gte('date_utc', fromIso)
				.lt('date_utc', toIso)
				// ORDRE DÉTERMINISTE (date puis id) : nécessaire à la pagination.
				.order('date_utc', { ascending: true })
				.order('id', { ascending: true })
		);
		const names = await this.teamNames();
		return ((data ?? []) as FixtureRow[]).map((r) => ({
			id: Number(r.id),
			dateUtc: r.date_utc,
			teamHome: names.get(Number(r.team_home_id)) ?? '',
			teamAway: names.get(Number(r.team_away_id)) ?? '',
			teamHomeId: Number(r.team_home_id),
			teamAwayId: Number(r.team_away_id),
			leagueId: Number(r.league_id),
			statut: r.statut,
			scoreHome: r.score_home,
			scoreAway: r.score_away
		}));
	}

	async teams(): Promise<Team[]> {
		// TOUTES les équipes, paginées (table > 1000 lignes) : matchTeam balaie cette
		// liste, une équipe manquante = un nom jamais résolu.
		const data = await selectAll<TeamRow>(() =>
			supabaseAdmin()
				.from('teams')
				.select('id, nom, aliases, league_id, club_id')
				.order('id', { ascending: true })
		);
		return (data as TeamRow[]).map((t) => ({
			id: Number(t.id),
			nom: t.nom,
			aliases: t.aliases ?? [],
			leagueId: Number(t.league_id),
			clubId: t.club_id != null ? Number(t.club_id) : null
		}));
	}

	async fixtureDates(ids: number[]): Promise<Map<number, number>> {
		const out = new Map<number, number>();
		if (ids.length === 0) return out;
		const { data, error } = await supabaseAdmin()
			.from('fixtures')
			.select('id, date_utc')
			.in('id', ids);
		if (error) throw error;
		for (const r of (data ?? []) as { id: number; date_utc: string | null }[])
			if (r.date_utc) out.set(Number(r.id), Date.parse(r.date_utc));
		return out;
	}

	async resultsSince(sinceIso: string): Promise<Fixture[]> {
		// Paginé : appelé avec l'époque (tous les matchs terminés JAMAIS) par le dashboard
		// et l'historique — largement > 1000 lignes. Sans pagination, le règlement et les
		// verdicts ne « voyaient » que 1000 matchs terminés → statuts faux sur les anciens.
		const data = await selectAll<FixtureRow>(() =>
			supabaseAdmin()
				.from('fixtures')
				.select('id, date_utc, statut, score_home, score_away, league_id, team_home_id, team_away_id')
				.eq('statut', 'finished')
				.gte('date_utc', sinceIso)
				// ORDRE DÉTERMINISTE (date puis id) : nécessaire à la pagination.
				.order('date_utc', { ascending: true })
				.order('id', { ascending: true })
		);
		const names = await this.teamNames();
		return ((data ?? []) as FixtureRow[]).map((r) => ({
			id: Number(r.id),
			dateUtc: r.date_utc,
			teamHome: names.get(Number(r.team_home_id)) ?? '',
			teamAway: names.get(Number(r.team_away_id)) ?? '',
			teamHomeId: Number(r.team_home_id),
			teamAwayId: Number(r.team_away_id),
			leagueId: Number(r.league_id),
			statut: r.statut,
			scoreHome: r.score_home,
			scoreAway: r.score_away
		}));
	}

	async coveredCompetitions(): Promise<CoverageEntry[]> {
		// Deux lectures, jointes en mémoire (pas de relation FK déclarée côté Supabase) :
		// le catalogue (nom, pays, régime) et l'état actif (leagues.actif, alimenté par
		// catalogue_sync). Join sur fd_code = provider_ref (invariant du pipeline).
		const admin = supabaseAdmin();
		const [cat, lg] = await Promise.all([
			admin.from('league_catalog').select('nom, pays, regime, fd_code'),
			admin.from('leagues').select('provider_ref, actif')
		]);
		if (cat.error) throw cat.error;
		if (lg.error) throw lg.error;
		const actifByRef = new Map(
			((lg.data ?? []) as { provider_ref: string; actif: boolean }[]).map((r) => [
				r.provider_ref,
				!!r.actif
			])
		);
		return ((cat.data ?? []) as { nom: string; pays: string | null; regime: string; fd_code: string }[]).map(
			(c) => ({
				nom: c.nom,
				pays: c.pays ?? '',
				regime: c.regime === 'modele' ? 'modele' : 'cote_seule',
				actif: actifByRef.get(c.fd_code) ?? false
			})
		);
	}
}
