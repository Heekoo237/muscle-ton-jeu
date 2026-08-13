import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

/**
 * Diagnostic de branchement Supabase. À ouvrir sur l'URL Vercel après avoir
 * renseigné les variables d'environnement et appliqué la migration :
 *   /api/health/supabase
 *
 * Ne renvoie aucune donnée sensible — seulement l'état de la connexion et le
 * fait que les tables existent (compte de `leagues`, vide mais présent).
 */
export const GET: RequestHandler = async () => {
	if (!isSupabaseConfigured()) {
		return json({
			configured: false,
			message: 'Variables SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes.'
		});
	}
	try {
		const sb = supabaseAdmin();
		const { count, error } = await sb
			.from('leagues')
			.select('*', { count: 'exact', head: true });
		if (error) {
			return json({ configured: true, ok: false, error: error.message });
		}
		return json({ configured: true, ok: true, schema: 'présent', leaguesCount: count ?? 0 });
	} catch (e) {
		return json({ configured: true, ok: false, error: e instanceof Error ? e.message : String(e) });
	}
};
