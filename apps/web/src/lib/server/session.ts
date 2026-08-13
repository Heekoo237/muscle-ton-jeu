/**
 * session.ts — Résout l'utilisateur courant, réel ou factice.
 *
 * Avec Supabase configuré : la session vient de l'Auth Google (cookie), et on
 * trouve/crée l'utilisateur applicatif correspondant. Sinon (local) : session
 * factice via le cookie 'session=demo'.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { ensureAppUser, memDemoUser } from '$lib/server/fixtures/userStore';

export const SESSION_COOKIE = 'session';

export interface AppSession {
	userId: number;
	prenom: string;
	email: string;
	credits: number;
	premierTicketUtilise: boolean;
	/** Photo de profil Google, si disponible ; sinon null (repli initiale). */
	avatarUrl: string | null;
}

export async function getAppSession(event: RequestEvent): Promise<AppSession | null> {
	// Chemin réel : Auth Google via Supabase.
	if (event.locals.supabase) {
		const { user } = await event.locals.safeGetSession();
		if (!user) return null;
		const meta = user.user_metadata ?? {};
		const prenom =
			(meta.full_name as string) ||
			(meta.name as string) ||
			(user.email ? user.email.split('@')[0] : 'Invité');
		const appUser = await ensureAppUser(user.id, user.email ?? '', prenom);
		const avatarUrl =
			(meta.avatar_url as string) || (meta.picture as string) || null;
		return {
			userId: appUser.id,
			prenom: appUser.prenom,
			email: appUser.email,
			credits: appUser.credits,
			premierTicketUtilise: appUser.premierTicketUtilise,
			avatarUrl
		};
	}

	// Chemin factice (local) : cookie 'session=demo'.
	if (event.cookies.get(SESSION_COOKIE) !== 'demo') return null;
	const u = memDemoUser();
	return {
		userId: u.id,
		prenom: u.prenom,
		email: u.email,
		credits: u.credits,
		premierTicketUtilise: u.premierTicketUtilise,
		avatarUrl: null
	};
}
