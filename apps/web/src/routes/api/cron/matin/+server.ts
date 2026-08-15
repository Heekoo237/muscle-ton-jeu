/**
 * /api/cron/matin — Rendez-vous du matin (8 h locale, jours avec matchs). N'envoie
 * QU'aux utilisateurs ayant une analyse offerte réellement disponible. Protégé par
 * `CRON_SECRET`. Appelé par un cron GitHub Actions à 7 h UTC (= 8 h locale UTC+1).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cronAutorise } from '$lib/server/cronAuth';
import { runMorningJob } from '$lib/server/notifRunner';

export const config = { maxDuration: 60 };

export const POST: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(401, 'Non autorisé.');
	const stats = await runMorningJob(event.url.origin, Date.now());
	console.log(
		`[cron matin] matchs=${stats.matchsAujourdhui} éligibles=${stats.eligibles} notifiés=${stats.notifies}`
	);
	return json({ ok: true, ...stats });
};
