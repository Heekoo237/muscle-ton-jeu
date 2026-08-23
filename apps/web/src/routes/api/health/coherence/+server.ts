import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { computeCoherence } from '$lib/server/fixtures/coherenceStore';

/**
 * Diagnostic de COHÉRENCE des probabilités en base (lecture seule, zéro crédit).
 * Né du cas Rennes–PSG (favori affiché perdant). Réservé au porteur du secret cron.
 *
 *   /api/health/coherence?key=<CRON_SECRET>
 *     → combien de matchs ont une somme 1X2 ≠ 100 %, une double chance désalignée,
 *       ou une orientation proba/cote qui se contredit (le symptôme du cas 1).
 *
 *   /api/health/coherence?key=<CRON_SECRET>&equipe=rennes
 *     → le DÉTAIL complet (proba ET cote de chaque marché) des matchs d'une équipe :
 *       on lit à l'œil si le favori est du bon côté.
 */
export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const equipe = event.url.searchParams.get('equipe') ?? undefined;
	const rapport = await computeCoherence(Date.now(), equipe);
	return json(rapport);
};
