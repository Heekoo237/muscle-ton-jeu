/**
 * /api/cron/settle — Règle les tickets terminés et envoie le suivi de résultat.
 * Appelé par le cron GitHub Actions (toutes les 6 h), juste après le rafraîchissement
 * des scores (Python). LIT la base, ne consomme aucun crédit fournisseur. Protégé
 * par le secret partagé (`CRON_SECRET`).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cronAutorise } from '$lib/server/cronAuth';
import { runSettleJob } from '$lib/server/notifRunner';

export const config = { maxDuration: 60 };

export const POST: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(401, 'Non autorisé.');
	const stats = await runSettleJob(event.url.origin, Date.now());
	console.log(
		`[cron settle] réglés=${stats.regles} notifiés=${stats.notifies} ` +
			`retenus(nuit)=${stats.retenus} déjà=${stats.deja}`
	);
	return json({ ok: true, ...stats });
};
