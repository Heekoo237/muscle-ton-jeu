/**
 * session.ts — Résout l'utilisateur courant, réel ou factice.
 *
 * Avec Supabase configuré : la session vient de l'Auth Google (cookie), et on
 * trouve/crée l'utilisateur applicatif correspondant. Sinon (local) : session
 * factice via le cookie 'session=demo'.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { ensureAppUser, memDemoUser } from '$lib/server/fixtures/userStore';
import { analysesOffertesRestantes } from '$lib/offer';

export const SESSION_COOKIE = 'session';

/**
 * Cookie-INDICE d'authentification (non sensible, lisible côté client). Il ne
 * contient qu'un « 1 » : un compte existe, pour afficher le bon bouton nav sur
 * les pages prérendues, sans scintillement. AUCUNE identité, AUCUN jeton, AUCUN
 * solde. Il ne donne accès à rien : les routes protégées restent vérifiées côté
 * serveur (cookie de session httpOnly). Un indice périmé n'ouvre aucune porte.
 */
export const AUTH_HINT_COOKIE = 'mtj_hint';
const AUTH_HINT_MAXAGE = 60 * 60 * 24 * 90; // 90 jours, aligné sur la session

/** Pose l'indice « un compte existe » (à la connexion réussie). */
export function setAuthHint(cookies: import('@sveltejs/kit').Cookies): void {
	cookies.set(AUTH_HINT_COOKIE, '1', {
		path: '/',
		httpOnly: false, // lisible par le script client (non sensible)
		sameSite: 'lax',
		maxAge: AUTH_HINT_MAXAGE
	});
}

/** Retire l'indice (à la déconnexion). */
export function clearAuthHint(cookies: import('@sveltejs/kit').Cookies): void {
	cookies.delete(AUTH_HINT_COOKIE, { path: '/' });
}

export interface AppSession {
	userId: number;
	prenom: string;
	email: string;
	credits: number;
	premierTicketUtilise: boolean;
	/** Analyses OFFERTES encore disponibles pour ce compte (bêta). */
	analysesOffertesRestantes: number;
	/** Photo de profil Google, si disponible ; sinon null (repli initiale). */
	avatarUrl: string | null;
}

export function getAppSession(event: RequestEvent): Promise<AppSession | null> {
	// Dédoublonnage PAR REQUÊTE : layout app, layout dashboard et page appellent tous
	// getAppSession. Sans cache, c'est 3× auth.getUser (réseau) + 3× lecture `users`.
	// On mémorise la PROMESSE (pas la valeur) pour couvrir les appels concurrents.
	if (event.locals.appSession) return event.locals.appSession;
	const p = resolveAppSession(event);
	event.locals.appSession = p;
	return p;
}

async function resolveAppSession(event: RequestEvent): Promise<AppSession | null> {
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
			analysesOffertesRestantes: analysesOffertesRestantes(appUser.analysesOffertesUtilisees),
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
		analysesOffertesRestantes: analysesOffertesRestantes(u.analysesOffertesUtilisees),
		avatarUrl: null
	};
}
