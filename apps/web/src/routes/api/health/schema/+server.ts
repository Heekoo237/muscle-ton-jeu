import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { checkSchema } from '$lib/server/schemaCheck';

/**
 * Vérification à la demande du décalage code/base (le pendant humain de la
 * surveillance 6 h). À ouvrir après chaque migration/déploiement :
 *   /api/health/schema?key=<CRON_SECRET>
 * Renvoie la liste EXACTE des objets manquants, avec leur numéro de migration.
 * Réservée au porteur du secret cron (comme les autres diagnostics).
 */
export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const res = await checkSchema();
	// 200 si aligné, 503 si un objet manque : un moniteur externe voit le rouge au code HTTP.
	return json({ configured: true, ...res }, { status: res.ok ? 200 : 503 });
};
