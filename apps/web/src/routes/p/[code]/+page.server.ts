import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolveShareCode } from '$lib/server/fixtures/shareStore';
import { getTicket } from '$lib/server/fixtures/ticketStore';
import { shareVMFromTicket, renderShareSvg } from '$lib/server/shareImage';

/**
 * Page publique d'un partage. Montre la même image que le partage, plus un
 * bouton « Analyser mon ticket ». N'expose AUCUNE donnée de compte.
 */
export const load: PageServerLoad = async (event) => {
	const ticketId = await resolveShareCode(event.params.code);
	const ticket = ticketId ? await getTicket(ticketId) : undefined;
	const vm = ticket ? shareVMFromTicket(ticket) : null;
	if (!vm) error(404, 'Partage introuvable');

	return {
		// SVG en ligne (les polices viennent de la page) pour un rendu net.
		svg: renderShareSvg(vm, false),
		ogImage: `${event.url.origin}/p/${event.params.code}/image`
	};
};
