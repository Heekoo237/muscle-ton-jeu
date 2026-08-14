/**
 * POST /api/maintenance/purge-captures — Purge les captures de plus de 30 jours.
 *
 * Protégé par un secret (en-tête Authorization: Bearer <CRON_SECRET>). Prévu pour
 * un cron quotidien (Vercel Cron dans vercel.json, ou tout planificateur qui
 * appelle l'URL). Sans secret configuré, l'endpoint refuse : jamais de purge
 * ouverte au public.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { purgeExpiredCaptures } from '$lib/server/fixtures/captureStore';

async function run(request: Request): Promise<Response> {
	const secret = env.CRON_SECRET;
	if (!secret) throw error(503, 'CRON_SECRET non configuré');
	if (request.headers.get('authorization') !== `Bearer ${secret}`) throw error(401, 'non autorisé');
	const purgees = await purgeExpiredCaptures();
	return json({ purgees });
}

export const POST: RequestHandler = ({ request }) => run(request);
// Vercel Cron déclenche en GET : on accepte les deux, même garde.
export const GET: RequestHandler = ({ request }) => run(request);
