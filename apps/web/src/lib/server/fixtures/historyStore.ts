/**
 * historyStore.ts — Données du bandeau d'historique de l'écran de résultat.
 *
 * Le bandeau montre des sélections déjà marquées (fragile ou solide) dont le
 * match est TERMINÉ et le résultat CONNU, avec l'issue réelle (passé / tombé).
 * Les résultats défavorables sont montrés aussi : un historique trié ne vaut
 * rien (CLAUDE.md, ton et rédaction).
 *
 * Règles :
 *  - uniquement des matchs terminés avec score en base ;
 *  - aucune donnée de démonstration, aucun remplissage ;
 *  - le règlement d'un marché contre le score est un CALCUL déterministe (jamais
 *    un LLM), sur les seuls marchés couverts (CLAUDE.md, marchés couverts).
 *
 * Tant que le pipeline nocturne n'a pas rempli fixtures (score) + teams, la
 * requête renvoie une liste vide et le bandeau ne s'affiche pas (garde ≥ 20
 * posée côté page). Aucun état intermédiaire « probable » n'existe.
 */
import type { HistoryItem, Market } from '$lib/types';
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

export type { HistoryItem };

/**
 * Règle un marché couvert contre un score final. Renvoie null pour un marché
 * non couvert (jamais réglé, jamais affiché).
 */
export function settleMarket(
	marche: Market,
	scoreHome: number,
	scoreAway: number
): boolean | null {
	const total = scoreHome + scoreAway;
	switch (marche) {
		case 'WIN_HOME':
			return scoreHome > scoreAway;
		case 'DRAW':
			return scoreHome === scoreAway;
		case 'WIN_AWAY':
			return scoreAway > scoreHome;
		case 'DC_HOME_DRAW':
			return scoreHome >= scoreAway;
		case 'DC_DRAW_AWAY':
			return scoreAway >= scoreHome;
		case 'DC_HOME_AWAY':
			return scoreHome !== scoreAway;
		case 'OVER_1_5':
			return total >= 2;
		case 'UNDER_1_5':
			return total <= 1;
		case 'OVER_2_5':
			return total >= 3;
		case 'UNDER_2_5':
			return total <= 2;
		case 'OVER_3_5':
			return total >= 4;
		case 'UNDER_3_5':
			return total <= 3;
		case 'BTTS_YES':
			return scoreHome >= 1 && scoreAway >= 1;
		case 'BTTS_NO':
			return scoreHome === 0 || scoreAway === 0;
		default:
			return null;
	}
}

type Row = Record<string, unknown>;
const numOrNull = (v: unknown): number | null =>
	v === null || v === undefined ? null : Number(v);

/**
 * Sélections réglables (match terminé, score connu, marché couvert), issues
 * réelles comprises. Défensif : toute erreur ou absence de données → [].
 */
export async function listHistoryMarquee(limit = 40): Promise<HistoryItem[]> {
	if (!isSupabaseConfigured()) return [];
	try {
		const sb = supabaseAdmin();

		// 1. Matchs terminés avec score connu.
		const { data: fx } = await sb
			.from('fixtures')
			.select('id, score_home, score_away, team_home_id, team_away_id')
			.eq('statut', 'finished')
			.not('score_home', 'is', null)
			.not('score_away', 'is', null)
			.order('date_utc', { ascending: false })
			.limit(200);
		if (!fx || fx.length === 0) return [];

		const fxMap = new Map<number, Row>(fx.map((f) => [Number(f.id), f as Row]));

		// 2. Noms d'équipes pour composer le libellé du match.
		const teamIds = [
			...new Set(fx.flatMap((f) => [Number(f.team_home_id), Number(f.team_away_id)]))
		];
		const { data: tm } = await sb.from('teams').select('id, nom').in('id', teamIds);
		const nameOf = new Map<number, string>(
			(tm ?? []).map((t) => [Number(t.id), String(t.nom)])
		);

		// 3. Sélections analysables portant sur ces matchs.
		const { data: sel } = await sb
			.from('selections')
			.select('fixture_id, marche, fragile, etat_resolution')
			.in('fixture_id', [...fxMap.keys()])
			.eq('etat_resolution', 'certain')
			.not('marche', 'is', null)
			.limit(limit * 4);
		if (!sel) return [];

		const items: HistoryItem[] = [];
		for (const s of sel) {
			const f = fxMap.get(Number(s.fixture_id));
			if (!f) continue;
			const home = nameOf.get(Number(f.team_home_id));
			const away = nameOf.get(Number(f.team_away_id));
			const sh = numOrNull(f.score_home);
			const sa = numOrNull(f.score_away);
			if (!home || !away || sh === null || sa === null) continue;
			const passe = settleMarket(s.marche as Market, sh, sa);
			if (passe === null) continue; // marché non couvert : jamais réglé
			items.push({ matchLabel: `${home} – ${away}`, fragile: Boolean(s.fragile), passe });
			if (items.length >= limit) break;
		}
		return items;
	} catch {
		return [];
	}
}
