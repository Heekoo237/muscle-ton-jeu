import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureAppUserDetailed } from '$lib/server/fixtures/userStore';
import { getTicket, updateTicket } from '$lib/server/fixtures/ticketStore';

/**
 * Callback OAuth Google (Supabase Auth). Échange le code contre une session,
 * rattache le ticket anonyme de la session en cours au compte, puis route :
 *   - ticket en attente        → /resultat (le mur tombe sur le résultat)
 *   - compte nouveau            → /analyser (premier ticket offert)
 *   - compte existant           → la route demandée (retour), sinon /dashboard
 */
export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const code = url.searchParams.get('code');
	const nextRaw = url.searchParams.get('next') ?? '/dashboard';
	const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard';

	if (!code || !locals.supabase) redirect(303, next);

	await locals.supabase.auth.exchangeCodeForSession(code);
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, next);

	const meta = user.user_metadata ?? {};
	const prenom =
		(meta.full_name as string) ||
		(meta.name as string) ||
		(user.email ? user.email.split('@')[0] : 'Invité');
	const { user: appUser, isNew } = await ensureAppUserDetailed(user.id, user.email ?? '', prenom);

	// Rattachement du ticket anonyme de la session (le plus récent = celui du
	// cookie). Un seul ticket est rattaché ; on ne touche qu'à un ticket encore
	// en lecture et non encore attribué.
	let pending = false;
	const ticketId = cookies.get('ticketId');
	if (ticketId) {
		const t = await getTicket(ticketId);
		// En attente = ticket existant pas encore analysé (en_lecture ou valide).
		if (t && t.statut !== 'analyse' && t.statut !== 'archive') {
			if (t.userId == null) await updateTicket(ticketId, { userId: appUser.id });
			pending = true;
		}
	}

	if (pending) redirect(303, '/resultat');
	if (isNew) redirect(303, '/analyser?offert=1');
	redirect(303, next);
};
