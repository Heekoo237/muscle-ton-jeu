import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordUploadRetry } from '$lib/server/fixtures/visionStatsStore';
import { rateLimit } from '$lib/server/ratelimit';

/**
 * Balise de télémétrie des RÉESSAIS d'upload, appelée par le client quand une
 * analyse a eu besoin de l'essai 2 (`{ echec }` = a réessayé mais échoué quand même).
 * Ce chiffre décide plus tard si l'upload résumable vaut l'investissement.
 *
 * TÉLÉMÉTRIE PURE : jamais bloquant, jamais d'erreur visible, aucune donnée
 * personnelle. Léger garde anti-abus par IP (le compteur est un simple seau du jour).
 */
export const POST: RequestHandler = async (event) => {
	try {
		const ip = event.getClientAddress();
		if (!(await rateLimit(`retry:ip:${ip}`, 60, 30))) return json({ ok: false });
		const body = (await event.request.json().catch(() => ({}))) as { echec?: unknown };
		await recordUploadRetry(body?.echec === true).catch(() => {});
	} catch {
		// la télémétrie ne casse jamais le parcours
	}
	return json({ ok: true });
};
