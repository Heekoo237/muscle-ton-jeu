/**
 * serreMesureStore.ts — Recalcule la mesure « serré vs solide » depuis ce qui est DÉJÀ
 * persisté (sélections gardées + scores des matchs). Aucun nouveau stockage ; le chiffre
 * grossit tout seul à mesure que les matchs se jouent. Réservé au diagnostic privé.
 *
 * Unité = DÉCISION de marché (match × marché) parmi les lignes GARDÉES (jamais les
 * retirées : une retirée n'est pas « serrée », elle est sortie), dédoublonnée. Serré est
 * déterministe par (match, marché) → on compte une fois, sinon on corrèle les observations.
 *
 * CAVEAT assumé : le seuil `seuil_fragile` n'est PAS persisté sur la sélection (relu de
 * `predictions` au résultat). On reclasse donc avec le seuil PAR MARCHÉ par défaut
 * (`fragileThreshold(marche, null)`) — EXACT pour les lignes régime MODÈLE (les seules
 * dont la barre « serré » est backtestée), approché pour les rares lignes cote seule
 * (barre fixe conservatrice). La mention serré étant un fait de régime mesuré, c'est le
 * bon périmètre. On MESURE, on ne suppose pas (règle d'or n°1 : règlement déterministe).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { settleMarket } from '$lib/server/domain/settle';
import { estSerree, isAnalysable } from '$lib/server/domain/ticket';
import { serreMesureStats, type SerreMesureStats } from '$lib/server/domain/serreMesure';
import { selectAll } from '$lib/server/supabasePage';
import type { Market, Selection } from '$lib/types';

type Row = Record<string, unknown>;

export async function computeSerreMesure(): Promise<SerreMesureStats> {
	if (!isSupabaseConfigured()) return serreMesureStats([]);
	const sb = supabaseAdmin();

	// 1. Matchs terminés avec score connu.
	const fx = await selectAll<Row>(() =>
		sb
			.from('fixtures')
			.select('id, score_home, score_away, team_home_id')
			.eq('statut', 'finished')
			.not('score_home', 'is', null)
			.not('score_away', 'is', null)
			.order('id', { ascending: true })
	);
	if (fx.length === 0) return serreMesureStats([]);
	const score = new Map<number, { h: number; a: number; homeId: number }>();
	for (const f of fx)
		score.set(Number(f.id), {
			h: Number(f.score_home),
			a: Number(f.score_away),
			homeId: Number(f.team_home_id)
		});

	// 2. Tickets ANALYSÉS : une proba/serré n'a de sens qu'après analyse.
	const tk = await selectAll<Row>(() =>
		sb.from('tickets').select('id').not('analyse_le', 'is', null).order('id', { ascending: true })
	);
	const analyses = new Set<number>(tk.map((t) => Number(t.id)));
	if (analyses.size === 0) return serreMesureStats([]);

	// 3. Sélections GARDÉES (non retirées), analysées, réglables sur ces matchs.
	const sel = await selectAll<Row>(() =>
		sb
			.from('selections')
			.select('ticket_id, fixture_id, marche, probabilite, retiree_du_renforce, etat_resolution, equipe_dom_id')
			.in('fixture_id', [...score.keys()])
			.eq('etat_resolution', 'certain')
			.eq('retiree_du_renforce', false)
			.not('marche', 'is', null)
			.not('probabilite', 'is', null)
			.order('ticket_id', { ascending: true })
	);

	// Dédoublonnage par (match, marché) : une décision comptée une fois.
	const vues = new Map<string, { serre: boolean; tombe: boolean }>();
	for (const s of sel) {
		if (!analyses.has(Number(s.ticket_id))) continue;
		const fid = Number(s.fixture_id);
		const marche = String(s.marche) as Market;
		const sc = score.get(fid);
		if (!sc) continue;
		// Reclasse serré/solide (seuil par défaut ; voir CAVEAT en tête).
		const ligne = {
			etatResolution: 'certain',
			marche,
			probabilite: Number(s.probabilite),
			seuilFragile: null
		} as Selection;
		if (!isAnalysable(ligne)) continue;
		// Snapshot d'orientation (migration 0025) : permute si le fixture a été retourné.
		const snap = s.equipe_dom_id;
		const [h, a] = snap != null && Number(snap) !== sc.homeId ? [sc.a, sc.h] : [sc.h, sc.a];
		const passe = settleMarket(marche, h, a);
		if (passe === null) continue; // marché non réglable
		const cle = `${fid}:${marche}`;
		if (!vues.has(cle)) vues.set(cle, { serre: estSerree(ligne), tombe: passe === false });
	}
	return serreMesureStats([...vues.values()]);
}
