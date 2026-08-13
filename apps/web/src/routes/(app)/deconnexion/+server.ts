import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE } from '$lib/server/session';

/**
 * Déconnexion. Réel : Supabase Auth signOut (efface le cookie de session Google).
 * Factice : on retire le cookie 'session'. Retour à l'accueil public.
 */
export const POST: RequestHandler = async (event) => {
	if (event.locals.supabase) {
		await event.locals.supabase.auth.signOut();
	}
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/');
};
