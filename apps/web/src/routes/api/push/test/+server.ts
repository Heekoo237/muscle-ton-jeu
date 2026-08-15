/**
 * /api/push/test — Envoie une notification de TEST aux appareils de l'utilisateur
 * connecté. Sert à vérifier de bout en bout qu'un push arrive vraiment sur le
 * téléphone, sans attendre qu'un vrai ticket se règle. Authentifié par la SESSION
 * (chacun ne peut se tester que soi-même), pas par le secret cron.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAppSession } from '$lib/server/session';
import { notifications } from '$lib/server/services';

export const POST: RequestHandler = async (event) => {
	const session = await getAppSession(event);
	if (!session) error(401, 'Connexion requise.');
	await notifications.notify(session.userId, {
		titre: 'Muscle Ton Jeu',
		corps: 'Notification de test. Tout est bien branché.',
		url: `${event.url.origin}/dashboard`
	});
	return json({ ok: true });
};
