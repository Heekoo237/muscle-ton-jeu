import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { computeSerreMesure } from '$lib/server/fixtures/serreMesureStore';

/**
 * Suivi PRIVÉ : l'état « serré » sépare-t-il vraiment ? Compare le taux de CHUTE des
 * lignes gardées SERRÉES à celui des SOLIDES. Si l'écart est net, la mention est
 * justifiée (il suffit de mieux la dire) ; s'il est nul, c'est l'état qu'il faut revoir.
 * Réservé au porteur du secret cron. Agrégats seuls — aucune donnée nominative.
 *
 *   /api/health/serrees?key=<CRON_SECRET>
 */
export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const stats = await computeSerreMesure();
	const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10);
	// Verdict lisible, avec le volume EN CLAIR (on sait qu'il est faible).
	const verdict = !stats.assez
		? `Trop peu de serrées réglées (${stats.serreesReglees}/${20}) — comptes donnés, pas de verdict : c'est du bruit sous ce seuil.`
		: stats.ecart !== null && stats.ecart >= 0.1
			? `Écart NET : les serrées tombent ${pct(stats.ecart)} pts plus souvent que les solides — la mention est justifiée.`
			: `Écart faible (${pct(stats.ecart)} pts) — à surveiller : l'état « serré » ne sépare peut-être pas assez.`;
	return json({
		configured: true,
		verdict,
		volume: { serreesReglees: stats.serreesReglees, solidesReglees: stats.solidesReglees },
		tauxChutePct: { serre: pct(stats.tauxChuteSerre), solide: pct(stats.tauxChuteSolide) },
		ecartPts: pct(stats.ecart),
		...stats
	});
};
