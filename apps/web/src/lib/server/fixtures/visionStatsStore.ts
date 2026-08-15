/**
 * visionStatsStore.ts — mesure de la variabilité de lecture VISION.
 *
 * On agrège, par jour, les lignes lues et les « lectures incomplètes » (marché
 * 1X2/double chance reconnu mais issue vide), plus les retries et leurs succès.
 * L'incrément est ATOMIQUE (fonction SQL `record_vision_read`) — pas de
 * read-modify-write concurrent. Best-effort : ne bloque JAMAIS l'analyse.
 */
import { supabaseAdmin, isSupabaseConfigured } from '$lib/server/supabase';

export async function recordVisionRead(
	lignes: number,
	incompletes: number,
	retries = 0,
	retriesReussis = 0
): Promise<void> {
	if (!isSupabaseConfigured()) return;
	await supabaseAdmin().rpc('record_vision_read', {
		p_lignes: lignes,
		p_incompletes: incompletes,
		p_retries: retries,
		p_retries_reussis: retriesReussis
	});
}
