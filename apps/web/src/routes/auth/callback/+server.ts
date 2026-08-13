import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Callback OAuth Google (Supabase Auth). Échange le code contre une session
 * (pose les cookies d'auth) puis revient exactement sur la page demandée.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	const nextRaw = url.searchParams.get('next') ?? '/dashboard';
	const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard';

	if (code && locals.supabase) {
		await locals.supabase.auth.exchangeCodeForSession(code);
	}
	redirect(303, next);
};
