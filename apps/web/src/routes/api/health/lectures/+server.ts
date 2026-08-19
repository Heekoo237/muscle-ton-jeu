import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { computeLectures } from '$lib/server/fixtures/lecturesStore';

/**
 * Échantillon PRIVÉ des lectures vision : `texteBrut` (ce que la vision a lu) à côté
 * du marché résolu. Rend OBSERVABLE la réécriture auto-cohérente (le seul risque que
 * le code ne peut pas attraper). On compare l'échantillon aux vraies captures : si le
 * texte brut ne colle pas, la vision a réécrit. Réservé au secret cron.
 *
 *   /api/health/lectures?key=<CRON_SECRET>&n=100
 */
export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const brut = Number(event.url.searchParams.get('n'));
	const n = Number.isFinite(brut) && brut > 0 ? Math.min(brut, 500) : 100;
	const rapport = await computeLectures(n);
	return json({ configured: true, ...rapport });
};
