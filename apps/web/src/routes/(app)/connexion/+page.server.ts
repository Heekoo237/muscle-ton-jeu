import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/server/session';

/** Cible de retour sûre : uniquement un chemin interne. */
function safeReturn(url: URL): string {
	const r = url.searchParams.get('retour');
	return r && r.startsWith('/') ? r : '/dashboard';
}

export const load: PageServerLoad = async ({ url }) => {
	return { retour: safeReturn(url) };
};

export const actions: Actions = {
	// Connexion Google factice : pose le jeton de session et revient au ticket.
	google: async ({ cookies, url }) => {
		cookies.set(SESSION_COOKIE, 'demo', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});
		redirect(303, safeReturn(url));
	}
};
