import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE, getAppSession } from '$lib/server/session';
import { getTicket } from '$lib/server/fixtures/ticketStore';

const JOURS_90 = 60 * 60 * 24 * 90; // session longue (PRD session auth)

/** Cible de retour sûre : uniquement un chemin interne. */
function safeReturn(url: URL): string {
	const r = url.searchParams.get('retour');
	return r && r.startsWith('/') ? r : '/dashboard';
}

export const load: PageServerLoad = async (event) => {
	const retour = safeReturn(event.url);

	// Ticket en attente = l'utilisateur arrive du mur, après validation de lecture.
	const ticketId = event.cookies.get('ticketId');
	let pending = false;
	if (ticketId) {
		const t = await getTicket(ticketId);
		// En attente = ticket existant pas encore analysé (en_lecture ou valide).
		pending = Boolean(t && t.statut !== 'analyse' && t.statut !== 'archive');
	}

	// Déjà connecté : pas d'écran de login, on file au bon endroit.
	const session = await getAppSession(event);
	if (session) redirect(303, pending ? '/resultat' : retour);

	return { retour, contexte: pending ? 'ticket' : 'retour' };
};

export const actions: Actions = {
	// Connexion Google. Réel via Supabase Auth ; factice en local.
	// `retour` vient du champ caché du formulaire (la query de l'URL est perdue
	// quand on poste vers ?/google).
	google: async (event) => {
		const { url, locals, cookies } = event;
		const form = await event.request.formData();
		const retourRaw = String(form.get('retour') ?? '');
		const retour = retourRaw.startsWith('/') ? retourRaw : '/dashboard';

		if (locals.supabase) {
			const redirectTo = `${url.origin}/auth/callback?next=${encodeURIComponent(retour)}`;
			const { data, error } = await locals.supabase.auth.signInWithOAuth({
				provider: 'google',
				options: { redirectTo }
			});
			if (error || !data?.url) return fail(500, { message: 'Connexion Google indisponible.' });
			redirect(303, data.url);
		}

		// Repli local : session factice, longue (90 jours).
		cookies.set(SESSION_COOKIE, 'demo', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: JOURS_90
		});
		redirect(303, retour);
	}
};
