/**
 * /api/push/subscribe — Enregistre l'abonnement Web Push du NAVIGATEUR courant.
 * Appelé après que l'utilisateur a accepté la permission (écran de résultat).
 * L'abonnement est lié au compte connecté ; l'upsert par endpoint évite les doublons.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAppSession } from '$lib/server/session';
import { notifications } from '$lib/server/services';

export const POST: RequestHandler = async (event) => {
	const session = await getAppSession(event);
	if (!session) error(401, 'Connexion requise.');

	const body = (await event.request.json().catch(() => null)) as {
		endpoint?: string;
		keys?: { p256dh?: string; auth?: string };
	} | null;
	const endpoint = body?.endpoint;
	const p256dh = body?.keys?.p256dh;
	const auth = body?.keys?.auth;
	if (!endpoint || !p256dh || !auth) error(400, 'Abonnement incomplet.');

	await notifications.saveSubscription(session.userId, { endpoint, p256dh, auth });
	return json({ ok: true });
};
