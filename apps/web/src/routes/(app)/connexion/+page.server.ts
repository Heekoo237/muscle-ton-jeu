import { redirect, fail } from '@sveltejs/kit';
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
	// Connexion Google. Réel via Supabase Auth ; factice en local.
	google: async (event) => {
		const { url, locals, cookies } = event;
		const retour = safeReturn(url);

		if (locals.supabase) {
			const redirectTo = `${url.origin}/auth/callback?next=${encodeURIComponent(retour)}`;
			const { data, error } = await locals.supabase.auth.signInWithOAuth({
				provider: 'google',
				options: { redirectTo }
			});
			if (error || !data?.url) return fail(500, { message: 'Connexion Google indisponible.' });
			redirect(303, data.url);
		}

		// Repli local : session factice.
		cookies.set(SESSION_COOKIE, 'demo', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});
		redirect(303, retour);
	}
};
