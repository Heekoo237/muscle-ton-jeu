import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAppSession } from '$lib/server/session';

/**
 * Diagnostic d'authentification. À ouvrir après connexion Google :
 *   /api/health/whoami
 * Renvoie si une session existe et l'email associé (rien de sensible).
 */
export const GET: RequestHandler = async (event) => {
	const session = await getAppSession(event);
	if (!session) return json({ loggedIn: false });
	return json({
		loggedIn: true,
		userId: session.userId,
		email: session.email,
		prenom: session.prenom
	});
};
