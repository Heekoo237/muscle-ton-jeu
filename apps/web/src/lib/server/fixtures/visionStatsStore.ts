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

/**
 * Compte un REFUS d'analyse par raison (seau quotidien). Un refus était invisible :
 * `record_vision_read` ne journalise que les succès. Best-effort — ne bloque jamais.
 */
export async function recordVisionRefus(raison: string): Promise<void> {
	if (!isSupabaseConfigured()) return;
	await supabaseAdmin().rpc('record_vision_refus', { p_raison: raison });
}

/** Refus « contenu » (échec de LECTURE) — vs erreurs amont (aucune, pas_une_image…). */
const REFUS_CONTENU = ['pas_un_ticket', 'illisible', 'incomplete'] as const;

export interface RefusDuJour {
	/** Lectures réussies aujourd'hui (dénominateur, depuis vision_stats). */
	lus: number;
	/** Refus par raison aujourd'hui. */
	refus: Record<string, number>;
	/** Vraies tentatives de lecture = lues + refus de contenu. */
	tentatives: number;
	/** Refus de contenu / tentatives — le « bloqué à la porte », null si trop peu. */
	tauxRefusContenu: number | null;
}

/**
 * Bilan des refus du JOUR (UTC, comme le `current_date` Supabase), pour l'endpoint
 * /api/health/lectures. Lecture seule, best-effort : renvoie null si non configuré.
 */
export async function refusDuJour(): Promise<RefusDuJour | null> {
	if (!isSupabaseConfigured()) return null;
	const sb = supabaseAdmin();
	const jour = new Date().toISOString().slice(0, 10);
	const [refusRes, vsRes] = await Promise.all([
		sb.from('vision_refus').select('raison, n').eq('jour', jour),
		sb.from('vision_stats').select('tickets').eq('jour', jour).maybeSingle()
	]);
	const refus: Record<string, number> = {};
	for (const r of (refusRes.data ?? []) as { raison: string; n: number }[]) {
		refus[r.raison] = Number(r.n);
	}
	const lus = Number((vsRes.data as { tickets?: number } | null)?.tickets ?? 0);
	const contenu = REFUS_CONTENU.reduce((s, k) => s + (refus[k] ?? 0), 0);
	const tentatives = lus + contenu;
	return {
		lus,
		refus,
		tentatives,
		tauxRefusContenu: tentatives > 0 ? Math.round((contenu / tentatives) * 1000) / 1000 : null
	};
}
