import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cronAutorise } from '$lib/server/cronAuth';
import { runBackfillJob } from '$lib/server/notifRunner';

export const config = { maxDuration: 60 };

/**
 * /api/cron/settle-backfill — RATTRAPAGE UNIQUE de la dette de règlement. Pose le
 * verdict des tickets analysés non réglés dont les matchs sont terminés, SANS la borne
 * de 7 jours du job régulier (qui laisse les vieux tickets en attente à vie). Silencieux
 * (aucune notification) et idempotent (`resultat IS NULL`) : on peut le relancer sans
 * risque. LIT la base, ne consomme aucun crédit fournisseur. Protégé par le secret cron.
 *
 *   curl -fsS -X POST -H "Authorization: Bearer <CRON_SECRET>" <APP_URL>/api/cron/settle-backfill
 */
export const POST: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(401, 'Non autorisé.');
	const stats = await runBackfillJob(Date.now());
	console.log(
		`[cron backfill] candidats=${stats.candidats} réglés=${stats.regles} ` +
			`enAttente=${stats.enAttente} sansRéglable=${stats.sansReglable}`
	);
	return json({ ok: true, ...stats });
};
