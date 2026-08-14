/**
 * supabase.ts — Faits DESCRIPTIFS lus depuis `fixtures` (matchs terminés déjà en
 * base). Forme récente, buts marqués/encaissés à domicile et à l'extérieur,
 * confrontations directes. Aucune probabilité n'est produite ici (règle d'archi
 * n°2 : le chemin temps réel LIT). Ce sont des résultats bruts que le rédacteur
 * transforme en phrases — il n'en invente aucun (règle d'or n°1).
 */
import type { StatsService, FaitsMatch, FaitsEquipe, Issue } from './index';
import { supabaseAdmin } from '$lib/server/supabase';

/** En dessous de ce nombre de matchs dans un contexte, la moyenne est tue (null). */
const MIN_MATCHS_MOYENNE = 3;
/** Nombre de résultats retenus pour la forme et les confrontations directes. */
const FORME = 5;
const H2H = 5;
/** Plafond de lignes lues (les plus récentes) pour ne pas balayer tout l'historique. */
const MAX_ROWS = 2000;

interface FinRow {
	id: number;
	date_utc: string;
	team_home_id: number;
	team_away_id: number;
	score_home: number | null;
	score_away: number | null;
}

interface Cible {
	id: number;
	home: number;
	away: number;
}

/** Résultat d'un match du point de vue d'une équipe donnée. */
function issuePour(equipe: number, r: FinRow): Issue {
	const chezSoi = r.team_home_id === equipe;
	const soi = chezSoi ? r.score_home! : r.score_away!;
	const adverse = chezSoi ? r.score_away! : r.score_home!;
	if (soi > adverse) return 'V';
	if (soi < adverse) return 'D';
	return 'N';
}

function moyenne(valeurs: number[]): number | null {
	if (valeurs.length < MIN_MATCHS_MOYENNE) return null;
	const somme = valeurs.reduce((a, b) => a + b, 0);
	return Math.round((somme / valeurs.length) * 10) / 10;
}

function faitsEquipe(nom: string, equipe: number, matchs: FinRow[]): FaitsEquipe {
	// matchs déjà triés du plus récent au plus ancien.
	const forme = matchs.slice(0, FORME).map((r) => issuePour(equipe, r));
	const marquesDom: number[] = [];
	const encaissesDom: number[] = [];
	const marquesExt: number[] = [];
	const encaissesExt: number[] = [];
	for (const r of matchs) {
		if (r.team_home_id === equipe) {
			marquesDom.push(r.score_home!);
			encaissesDom.push(r.score_away!);
		} else {
			marquesExt.push(r.score_away!);
			encaissesExt.push(r.score_home!);
		}
	}
	return {
		nom,
		forme,
		butsMarquesDom: moyenne(marquesDom),
		butsEncaissesDom: moyenne(encaissesDom),
		butsMarquesExt: moyenne(marquesExt),
		butsEncaissesExt: moyenne(encaissesExt),
		joues: matchs.length
	};
}

export class SupabaseStats implements StatsService {
	async forFixtures(fixtureIds: number[]): Promise<Map<number, FaitsMatch>> {
		const out = new Map<number, FaitsMatch>();
		if (fixtureIds.length === 0) return out;

		// 1. Les matchs cibles : qui joue contre qui (équipes home/away par fixtureId).
		const { data: cibleRows, error: e1 } = await supabaseAdmin()
			.from('fixtures')
			.select('id, team_home_id, team_away_id')
			.in('id', fixtureIds);
		if (e1) throw e1;
		const cibles: Cible[] = (cibleRows ?? []).map((r) => ({
			id: Number(r.id),
			home: Number(r.team_home_id),
			away: Number(r.team_away_id)
		}));
		if (cibles.length === 0) return out;

		// 2. Toutes les équipes impliquées, et leurs noms.
		const equipeIds = [...new Set(cibles.flatMap((c) => [c.home, c.away]))];
		const noms = await this.teamNames(equipeIds);

		// 3. Matchs terminés impliquant ces équipes, les plus récents d'abord.
		//    Un seul balayage : on répartit ensuite par équipe côté JS.
		const liste = equipeIds.join(',');
		const { data: finRows, error: e2 } = await supabaseAdmin()
			.from('fixtures')
			.select('id, date_utc, team_home_id, team_away_id, score_home, score_away')
			.eq('statut', 'finished')
			.not('score_home', 'is', null)
			.not('score_away', 'is', null)
			.or(`team_home_id.in.(${liste}),team_away_id.in.(${liste})`)
			.order('date_utc', { ascending: false })
			.limit(MAX_ROWS);
		if (e2) throw e2;
		const termines = (finRows ?? []) as FinRow[];

		// Index par équipe (déjà trié desc par la requête).
		const parEquipe = new Map<number, FinRow[]>();
		for (const id of equipeIds) parEquipe.set(id, []);
		for (const r of termines) {
			parEquipe.get(r.team_home_id)?.push(r);
			parEquipe.get(r.team_away_id)?.push(r);
		}

		for (const c of cibles) {
			const home = faitsEquipe(noms.get(c.home) ?? '', c.home, parEquipe.get(c.home) ?? []);
			const away = faitsEquipe(noms.get(c.away) ?? '', c.away, parEquipe.get(c.away) ?? []);
			// Confrontations directes : parmi les matchs de l'équipe à domicile, ceux
			// qui l'opposent à l'équipe à l'extérieur, du point de vue du domicile.
			const h2h = (parEquipe.get(c.home) ?? [])
				.filter((r) => r.team_home_id === c.away || r.team_away_id === c.away)
				.slice(0, H2H)
				.map((r) => issuePour(c.home, r));
			out.set(c.id, { fixtureId: c.id, home, away, h2h });
		}
		return out;
	}

	private async teamNames(ids: number[]): Promise<Map<number, string>> {
		if (ids.length === 0) return new Map();
		const { data, error } = await supabaseAdmin().from('teams').select('id, nom').in('id', ids);
		if (error) throw error;
		return new Map((data ?? []).map((t) => [Number(t.id), t.nom as string]));
	}
}
