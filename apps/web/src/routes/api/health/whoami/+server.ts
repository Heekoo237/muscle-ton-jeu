import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { getAppSession } from '$lib/server/session';

/**
 * Diagnostic d'authentification. À ouvrir après (ou avant) connexion Google :
 *   /api/health/whoami
 * Indique le mode d'auth actif (supabase = réel, fake = factice), la présence des
 * variables publiques, et l'état de session (rien de sensible).
 */
export const GET: RequestHandler = async (event) => {
	const authMode = event.locals.supabase ? 'supabase' : 'fake';
	const publicEnv = {
		hasPublicUrl: Boolean(env.PUBLIC_SUPABASE_URL),
		hasPublicAnon: Boolean(env.PUBLIC_SUPABASE_ANON_KEY)
	};
	const session = await getAppSession(event);
	return json({
		authMode,
		...publicEnv,
		loggedIn: session !== null,
		email: session?.email ?? null,
		prenom: session?.prenom ?? null
	});
};
