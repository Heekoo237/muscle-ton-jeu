/**
 * hooks.server.ts — Client Supabase Auth par requête (SSR, @supabase/ssr).
 *
 * Quand les variables publiques Supabase sont présentes, chaque requête reçoit un
 * client Auth câblé aux cookies : c'est lui qui porte la session Google. Sinon
 * (local, sans Supabase), `locals.supabase` reste null et le produit retombe sur
 * l'authentification factice.
 */
import { createServerClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const url = env.PUBLIC_SUPABASE_URL;
	const anon = env.PUBLIC_SUPABASE_ANON_KEY;

	if (url && anon) {
		event.locals.supabase = createServerClient(url, anon, {
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					for (const { name, value, options } of cookiesToSet) {
						event.cookies.set(name, value, { ...options, path: '/' });
					}
				}
			}
		});
		event.locals.safeGetSession = async () => {
			const {
				data: { user },
				error
			} = await event.locals.supabase!.auth.getUser();
			if (error || !user) return { user: null };
			return { user };
		};
	} else {
		event.locals.supabase = null;
		event.locals.safeGetSession = async () => ({ user: null });
	}

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};
