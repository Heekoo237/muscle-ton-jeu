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
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { runWithDbMeter, currentDbMeter, DB_QUERY_WARN_THRESHOLD } from '$lib/server/dbmeter';

/**
 * Toute erreur non rattrapée (load, rendu, chargement de module) passe ici. On
 * JOURNALISE la cause technique côté serveur — c'est elle qu'on lit dans les
 * logs — et on ne renvoie au client qu'un message LISIBLE, jamais la stack. La
 * page +error.svelte l'affiche avec le lien support. Aucune 500 brute.
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	console.error(`[${status ?? 500}] ${event.request.method} ${event.url.pathname}`, error);
	return { message: 'Une erreur est survenue de notre côté. Réessaie dans un instant.' };
};

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

	// Chaque requête tourne dans un contexte de MESURE : on compte les requêtes base
	// et on alerte au-delà du seuil (garde-fou anti-boucle, cf. dbmeter.ts).
	return runWithDbMeter(async () => {
		const response = await resolve(event, {
			filterSerializedResponseHeaders: (name) =>
				name === 'content-range' || name === 'x-supabase-api-version'
		});
		const m = currentDbMeter();
		// On n'alerte que sur les pages/données (au moins une requête) — pas les assets.
		if (m && m.count > DB_QUERY_WARN_THRESHOLD) {
			console.warn(
				`[dbmeter] ${event.request.method} ${event.url.pathname} — ${m.count} requêtes base ` +
					`(seuil ${DB_QUERY_WARN_THRESHOLD}) ${JSON.stringify(m.byTable)}`
			);
		}
		return response;
	});
};
