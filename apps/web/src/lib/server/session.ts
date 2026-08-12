/**
 * session.ts — Lecture de la session depuis les cookies (côté serveur uniquement).
 * Centralise le nom du cookie et l'appel au service d'auth. Le vrai jeton
 * (Supabase Auth) remplacera la valeur factice 'demo' en Session 8.
 */
import type { Cookies } from '@sveltejs/kit';
import { auth } from '$lib/server/services';
import type { UserSession } from '$lib/server/services/auth';

export const SESSION_COOKIE = 'session';

export async function getSession(cookies: Cookies): Promise<UserSession | null> {
	const token = cookies.get(SESSION_COOKIE);
	return token ? auth.currentSession(token) : null;
}
