import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveShareCode } from '$lib/server/fixtures/shareStore';
import { getTicket } from '$lib/server/fixtures/ticketStore';
import { shareVMFromTicket, renderShareSvg } from '$lib/server/shareImage';
import { rateLimit, RATE_LIMITS } from '$lib/server/ratelimit';

/**
 * Image de partage 1080 × 1350, rendu serveur, gabarit fixe, mise en cache
 * (même ticket = même image). PNG (og:image, vignette WhatsApp). Repli SVG
 * autonome si la rasterisation échoue — l'endpoint ne tombe jamais en 500.
 * Aucune donnée de compte.
 */
export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	// Garde-fou charge (C1/8b) : la rasterisation resvg est coûteuse. Le CDN sert le
	// trafic normal (cache immutable), donc cette borne ne frappe que le martèlement
	// direct de l'origine. FAIL-OPEN : jamais de blocage d'un partage légitime sur une
	// panne du limiteur (voir ratelimit.ts).
	const ip = getClientAddress();
	const { fenetreS, max } = RATE_LIMITS.imagePartageIp;
	if (!(await rateLimit(`image:ip:${ip}`, fenetreS, max))) error(429, 'Trop de requêtes.');

	const ticketId = await resolveShareCode(params.code);
	const ticket = ticketId ? await getTicket(ticketId) : undefined;
	const vm = ticket ? shareVMFromTicket(ticket) : null;
	if (!vm) error(404, 'Partage introuvable');

	try {
		// Import paresseux : si le binaire natif resvg ne se charge pas, on tombe
		// proprement sur le SVG (l'endpoint ne renvoie jamais 500).
		const { renderSharePng } = await import('$lib/server/shareImagePng');
		const png = renderSharePng(vm) as unknown as BodyInit;
		return new Response(png, {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=86400, immutable'
			}
		});
	} catch {
		// Repli : SVG autonome (polices embarquées). Rare.
		return new Response(renderShareSvg(vm, true), {
			headers: {
				'Content-Type': 'image/svg+xml; charset=utf-8',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	}
};
