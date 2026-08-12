import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTicket } from '$lib/server/fixtures/ticketStore';

/**
 * Stub de l'écran de résultat — le module de comparaison signature est construit
 * en Session 4. Ici on confirme seulement que le ticket est arrivé validé.
 */
export const load: PageServerLoad = async ({ cookies }) => {
	const id = cookies.get('ticketId');
	const ticket = id ? getTicket(id) : undefined;
	if (!ticket) redirect(303, '/analyser');
	const analysables = ticket.selections.filter((s) => s.etatResolution === 'certain').length;
	return { statut: ticket.statut, analysables, total: ticket.selections.length };
};
