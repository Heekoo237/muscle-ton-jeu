import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAppUserDetailed } from '$lib/server/fixtures/userStore';
import { getTicket, updateTicket } from '$lib/server/fixtures/ticketStore';
import { setAuthHint } from '$lib/server/session';

/**
 * Callback OAuth Google (Supabase Auth). Échange le code contre une session,
 * rattache le ticket anonyme de la session au compte, puis route :
 *   - ticket en attente → /resultat (le mur tombe sur le résultat)
 *   - compte nouveau    → /analyser (premier ticket offert)
 *   - compte existant   → la route demandée (retour), sinon /dashboard
 *
 * RÈGLE : un échec d'authentification n'affiche JAMAIS une 500 brute. Tout le
 * travail faillible (échange du code, lecture de session, écriture compte) est
 * encapsulé ; à la moindre erreur on journalise la cause TECHNIQUE côté serveur
 * et on renvoie l'utilisateur vers une page lisible avec le lien support.
 */
function echecConnexion(retour: string): string {
	return `/connexion?erreur=auth&retour=${encodeURIComponent(retour)}`;
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const nextRaw = url.searchParams.get('next') ?? '/dashboard';
	const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard';

	// Google peut renvoyer une erreur explicite (accès refusé, consentement annulé).
	const oauthError = url.searchParams.get('error');
	if (oauthError) {
		console.warn(
			`[auth] retour OAuth en erreur: ${oauthError} — ${url.searchParams.get('error_description') ?? ''}`
		);
		redirect(303, echecConnexion(next));
	}

	const code = url.searchParams.get('code');
	if (!code || !locals.supabase) redirect(303, next);

	// La destination de SUCCÈS est calculée dans le try, puis lancée HORS du try :
	// `redirect()` lève une exception, il ne doit pas être confondu avec une erreur.
	let destination: string;
	try {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (error) throw error;

		const { user } = await locals.safeGetSession();
		if (!user) throw new Error('session absente après échange du code');

		const meta = user.user_metadata ?? {};
		const prenom =
			(meta.full_name as string) ||
			(meta.name as string) ||
			(user.email ? user.email.split('@')[0] : 'Invité');
		const { user: appUser, isNew } = await ensureAppUserDetailed(user.id, user.email ?? '', prenom);

		// Rattachement du ticket anonyme de la session (un seul, encore en lecture).
		let pending = false;
		const ticketId = cookies.get('ticketId');
		if (ticketId) {
			const t = await getTicket(ticketId);
			if (t && t.statut !== 'analyse' && t.statut !== 'archive') {
				if (t.userId == null) await updateTicket(ticketId, { userId: appUser.id });
				pending = true;
			}
		}

		// Indice non sensible pour la nav des pages prérendues (aucun accès accordé).
		setAuthHint(cookies);
		destination = pending ? '/resultat' : isNew ? '/analyser?offert=1' : next;
	} catch (e) {
		// Cause technique lisible côté serveur (c'est elle qu'on lit au moment d'un 500)…
		console.error('[auth] échec du callback OAuth:', e);
		// …et message lisible + support côté utilisateur, jamais une erreur brute.
		redirect(303, echecConnexion(next));
	}

	redirect(303, destination);
};
