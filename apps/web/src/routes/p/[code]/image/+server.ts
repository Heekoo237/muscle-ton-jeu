import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveShareCode } from '$lib/server/fixtures/shareStore';
import { getTicket } from '$lib/server/fixtures/ticketStore';
import { shareVMFromTicket, renderShareSvg } from '$lib/server/shareImage';

/**
 * Image de partage (SVG autonome, polices embarquées) pour og:image et
 * rasterisation. Gabarit fixe, rendu serveur, mis en cache (même ticket = même
 * image). Aucune donnée de compte.
 */
export const GET: RequestHandler = async ({ params }) => {
	const ticketId = await resolveShareCode(params.code);
	const ticket = ticketId ? await getTicket(ticketId) : undefined;
	const vm = ticket ? shareVMFromTicket(ticket) : null;
	if (!vm) error(404, 'Partage introuvable');

	return new Response(renderShareSvg(vm, true), {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=86400, immutable'
		}
	});
};
