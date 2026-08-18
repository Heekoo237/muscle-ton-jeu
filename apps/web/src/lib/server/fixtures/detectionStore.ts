/**
 * detectionStore.ts — Accumule la donnée de DÉTECTION depuis ce qui est DÉJÀ persisté
 * (sélections marquées fragiles + scores des matchs). Aucun nouveau stockage : le
 * chiffre se recalcule à la demande, il grossit tout seul à mesure que les matchs se
 * jouent. NON affiché publiquement (voir CLAUDE.md) — préparé pour le jour du volume.
 *
 * Règlement déterministe (settleMarket), jamais de LLM. Unité = DÉCISION de marché
 * (match × marché), dédoublonnée : le flag fragile est déterministe par (match,
 * marché), compter par ticket corrélerait les observations.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { settleMarket } from '$lib/server/domain/settle';
import { detectionStats, type DetectionStats } from '$lib/server/domain/detection';
import type { Market } from '$lib/types';

type Row = Record<string, unknown>;

export async function computeDetection(): Promise<DetectionStats> {
	if (!isSupabaseConfigured()) return detectionStats([]);
	const sb = supabaseAdmin();

	// 1. Matchs terminés avec score connu.
	const { data: fx } = await sb
		.from('fixtures')
		.select('id, score_home, score_away')
		.eq('statut', 'finished')
		.not('score_home', 'is', null)
		.not('score_away', 'is', null);
	if (!fx || fx.length === 0) return detectionStats([]);
	const score = new Map<number, { h: number; a: number }>();
	for (const f of fx as Row[]) score.set(Number(f.id), { h: Number(f.score_home), a: Number(f.score_away) });

	// 2. Tickets réellement ANALYSÉS : une sélection n'a un flag fragile SENSÉ qu'après
	//    analyse (avant, fragile = false par défaut, ce qui polluerait le seau solide).
	const { data: tk } = await sb.from('tickets').select('id').not('analyse_le', 'is', null);
	const analyses = new Set<number>((tk ?? []).map((t) => Number((t as Row).id)));
	if (analyses.size === 0) return detectionStats([]);

	// 3. Sélections réglables sur ces matchs, issues d'un ticket analysé.
	const { data: sel } = await sb
		.from('selections')
		.select('ticket_id, fixture_id, marche, fragile, etat_resolution')
		.in('fixture_id', [...score.keys()])
		.eq('etat_resolution', 'certain')
		.not('marche', 'is', null);

	// Dédoublonnage par (match, marché) : une décision comptée une fois.
	const vues = new Map<string, { fragile: boolean; tombe: boolean }>();
	for (const s of (sel ?? []) as Row[]) {
		if (!analyses.has(Number(s.ticket_id))) continue;
		const fid = Number(s.fixture_id);
		const marche = String(s.marche);
		const sc = score.get(fid);
		if (!sc) continue;
		const passe = settleMarket(marche as Market, sc.h, sc.a);
		if (passe === null) continue; // marché non couvert : jamais réglé
		const cle = `${fid}:${marche}`;
		if (!vues.has(cle)) vues.set(cle, { fragile: Boolean(s.fragile), tombe: passe === false });
	}
	return detectionStats([...vues.values()]);
}
