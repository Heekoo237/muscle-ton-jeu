import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { computeCouverture } from '$lib/server/fixtures/couvertureStore';

/**
 * Suivi PRIVÉ des causes de non-analyse, fenêtré. Sert surtout à voir `sans_donnee`
 * s'effondrer après le correctif d'intérim cote seule (compare `?p=7j` maintenant et
 * dans quelques jours), et à séparer `non_resolu` (reconnaissance, notre lacune) de
 * `hors_couverture` (championnat absent, limite externe). Réservé au secret cron.
 *
 *   /api/health/couverture?key=<CRON_SECRET>&p=7j   (p ∈ jour | 7j | 30j | tout)
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
	const jours = p === '30j' ? 30 : 7; // défaut 7j
	return new Date(now - jours * 86_400_000).toISOString();
}

export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const brut = event.url.searchParams.get('p');
	const p = brut === 'jour' || brut === '30j' || brut === 'tout' ? brut : '7j';
	const rapport = await computeCouverture(depuisDe(p));
	return json({ configured: true, periode: p, ...rapport });
};
