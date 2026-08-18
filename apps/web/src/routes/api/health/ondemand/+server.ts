import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { computeOndemand } from '$lib/server/odds/ondemandStore';

/**
 * Suivi PRIVÉ de la récupération À LA DEMANDE : appels/jour, succès, crédits
 * fournisseur consommés, taux d'échec (pour repérer un disjoncteur qui s'ouvre).
 * Réservé au secret cron.
 *
 *   /api/health/ondemand?key=<CRON_SECRET>&p=jour   (p ∈ jour | 7j | 30j | tout)
 */
const UTC_OFFSET_MS = 3_600_000; // Afrique de l'Ouest/Centrale (UTC+1)

function depuisDe(p: string | null): string | null {
	if (p === 'tout') return null;
	const now = Date.now();
	if (p === 'jour') {
		const local = new Date(now + UTC_OFFSET_MS);
		local.setUTCHours(0, 0, 0, 0);
		return new Date(local.getTime() - UTC_OFFSET_MS).toISOString();
	}
	const jours = p === '30j' ? 30 : 7;
	return new Date(now - jours * 86_400_000).toISOString();
}

export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const brut = event.url.searchParams.get('p');
	const p = brut === '7j' || brut === '30j' || brut === 'tout' ? brut : 'jour';
	const rapport = await computeOndemand(depuisDe(p));
	return json({ configured: true, periode: p, ...rapport });
};
