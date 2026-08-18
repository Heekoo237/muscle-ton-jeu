import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { computeDetection } from '$lib/server/fixtures/detectionStore';

/**
 * Suivi PRIVÉ du chiffre de détection (fragiles tombés vs solides tombés), pour le
 * regarder s'accumuler avant d'atteindre le volume. NON public : c'est le pendant
 * privé d'un chiffre qu'on n'affiche pas encore (voir CLAUDE.md). Réservé au porteur
 * du secret cron. Ne renvoie que des agrégats — aucune donnée nominative.
 */
export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const stats = await computeDetection();
	return json({ configured: true, ...stats });
};
