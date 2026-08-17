import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveShareCode } from '$lib/server/fixtures/shareStore';
import { getTicket } from '$lib/server/fixtures/ticketStore';
import { shareVMFromTicket, renderShareSvg, type ShareVM } from '$lib/server/shareImage';
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

	// Deux échecs, deux traitements DISTINCTS :
	//  - binaire resvg indisponible (cas plateforme) → SVG autonome, qui embarque les
	//    polices et REND le texte dans un navigateur : un repli acceptable ;
	//  - polices non rendues (auto-test échoué) → on REFUSE d'émettre. Une image sans
	//    texte diffusée à mille personnes est pire qu'une absence d'image (exigence
	//    produit : jamais d'image vide partagée).
	let renderSharePng: (vm: ShareVM) => Uint8Array;
	try {
		({ renderSharePng } = await import('$lib/server/shareImagePng'));
	} catch (e) {
		console.error('[partage] binaire resvg indisponible — repli SVG :', e);
		return new Response(renderShareSvg(vm, true), {
			headers: {
				'Content-Type': 'image/svg+xml; charset=utf-8',
				'Cache-Control': 'public, max-age=3600'
			}
		});
	}

	let png: Uint8Array;
	try {
		png = renderSharePng(vm);
	} catch (e) {
		// Polices absentes : rendu vide probable → on ne sert RIEN plutôt qu'une image
		// blanche. 503 (temporaire) sans cache : le prochain déploiement corrigé reprend.
		console.error('[partage] polices indisponibles — image REFUSÉE (jamais de blanc) :', e);
		error(503, 'Image de partage momentanément indisponible.');
	}
	return new Response(png as unknown as BodyInit, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=86400, immutable'
		}
	});
};
