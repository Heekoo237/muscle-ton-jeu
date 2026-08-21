import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { diagnostiquerReglement } from '$lib/server/fixtures/reglementDiag';

/**
 * Diagnostic du RÈGLEMENT (lecture seule, zéro crédit). À ouvrir pour comprendre
 * pourquoi des tickets restent « en attente » :
 *   /api/health/reglement?key=<CRON_SECRET>
 * Renvoie la répartition réglés / en attente ET, pour les en attente, la CAUSE
 * (scores absents, match à venir, tickets hors fenêtre, ou réglé-mais-non-posé).
 * Réservé au porteur du secret cron, comme les autres diagnostics.
 */
export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const diag = await diagnostiquerReglement(Date.now());
	return json({ configured: true, ...diag });
};
