import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { vision, sports } from '$lib/server/services';
import { resolveTicket } from '$lib/server/domain/resolve';
import { createTicket } from '$lib/server/fixtures/ticketStore';
import { getAppSession } from '$lib/server/session';

/**
 * On n'affiche « gratuitement » que si le ticket d'essai est encore disponible :
 * visiteur anonyme (premier passage probable) ou connecté n'ayant pas encore
 * utilisé son premier ticket. Un habitué qui a déjà consommé l'essai ne voit
 * pas de promesse de gratuité (le coût est décidé à l'affichage du résultat).
 */
export const load: PageServerLoad = async (event) => {
	const session = await getAppSession(event);
	return { ticketOffert: !session || !session.premierTicketUtilise };
};

/**
 * Envoi des captures → lecture (vision) → résolution (code) → sauvegarde du
 * ticket AVANT tout paiement (règle de facturation n°2) → écran de validation.
 *
 * En factice, la vision ignore les fichiers et rend un ticket type. Le vrai
 * modèle (Session 8) reçoit les images ; le reste du chemin ne change pas.
 */
export const actions: Actions = {
	default: async (event) => {
		const { cookies } = event;
		const session = await getAppSession(event);
		const raw = await vision.readTicket([]);
		const [fixtures, teams] = await Promise.all([sports.upcomingFixtures(), sports.teams()]);
		const selections = resolveTicket(raw, fixtures, teams);
		const ticket = await createTicket(selections, session?.userId ?? null);
		cookies.set('ticketId', ticket.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24
		});
		redirect(303, '/analyser/validation');
	}
};
