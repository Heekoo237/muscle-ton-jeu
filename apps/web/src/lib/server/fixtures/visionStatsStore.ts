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

/**
 * Compte un RÉESSAI d'upload. `echec` = a réessayé (essai 2) ET a quand même échoué.
 * `echec=false` = l'essai 2 a sauvé l'analyse. Best-effort — ne bloque jamais.
 */
export async function recordUploadRetry(echec: boolean): Promise<void> {
	if (!isSupabaseConfigured()) return;
	await supabaseAdmin().rpc('record_upload_retry', { p_echec: echec });
}

/** Refus « contenu » comptés dans `vision_refus` (le vrai « pas un ticket »). L'upload
 *  incomplet, lui, est suivi via les compteurs de réessai — pour ne pas compter chaque
 *  TENTATIVE d'un même utilisateur comme un refus distinct. */
const REFUS_CONTENU = ['pas_un_ticket', 'illisible'] as const;

export interface RefusDuJour {
	/** Lectures réussies aujourd'hui (dénominateur, depuis vision_stats). */
	lus: number;
	/** Refus par raison aujourd'hui (vision_refus). */
	refus: Record<string, number>;
	/** Analyses ayant eu besoin de l'essai 2, et celles échouées malgré les deux. */
	essai2: number;
	essai2Echec: number;
	/** Vraies tentatives = lues + refus de contenu + échecs d'upload survivants au retry. */
	tentatives: number;
	/** « Bloqué à la porte » / tentatives (pas_un_ticket + illisible + essai2_echec). null si trop peu. */
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
		sb
			.from('vision_stats')
			.select('tickets, uploads_essai2, uploads_essai2_echec')
			.eq('jour', jour)
			.maybeSingle()
	]);
	const refus: Record<string, number> = {};
	for (const r of (refusRes.data ?? []) as { raison: string; n: number }[]) {
		refus[r.raison] = Number(r.n);
	}
	const vs = (vsRes.data ?? {}) as {
		tickets?: number;
		uploads_essai2?: number;
		uploads_essai2_echec?: number;
	};
	const lus = Number(vs.tickets ?? 0);
	const essai2 = Number(vs.uploads_essai2 ?? 0);
	const essai2Echec = Number(vs.uploads_essai2_echec ?? 0);
	const contenu = REFUS_CONTENU.reduce((s, k) => s + (refus[k] ?? 0), 0) + essai2Echec;
	const tentatives = lus + contenu;
	return {
		lus,
		refus,
		essai2,
		essai2Echec,
		tentatives,
		tauxRefusContenu: tentatives > 0 ? Math.round((contenu / tentatives) * 1000) / 1000 : null
	};
}
