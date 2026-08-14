import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { vision, sports } from '$lib/server/services';
import type { ImageInput } from '$lib/server/services/vision';
import { resolveTicket } from '$lib/server/domain/resolve';
import { createTicket } from '$lib/server/fixtures/ticketStore';
import {
	sha256Hex,
	combinedEmpreinte,
	findRecentTicketByEmpreinte,
	storeCaptures
} from '$lib/server/fixtures/captureStore';
import { getAppSession } from '$lib/server/session';

const SLOTS = ['capture_0', 'capture_1', 'capture_2'];
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function setTicketCookie(cookies: import('@sveltejs/kit').Cookies, id: string): void {
	cookies.set('ticketId', id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 });
}

/**
 * On n'affiche « gratuitement » que si le ticket d'essai est encore disponible :
 * visiteur anonyme (premier passage probable) ou connecté n'ayant pas encore
 * utilisé son premier ticket. Un habitué qui a déjà consommé l'essai ne voit
 * pas de promesse de gratuité (le coût est décidé à l'affichage du résultat).
 */
export const load: PageServerLoad = async (event) => {
	const session = await getAppSession(event);
	return {
		ticketOffert: !session || !session.premierTicketUtilise,
		// Bandeau « premier ticket offert » pour un compte tout juste créé (?offert=1).
		offert: event.url.searchParams.get('offert') === '1'
	};
};

/**
 * Envoi des captures → lecture (vision RÉELLE) → résolution (code) → sauvegarde
 * du ticket AVANT tout paiement (règle de facturation n°2) → écran de validation.
 *
 * Chemin de l'image : on extrait 1 à 3 captures de la requête, on refuse ce qui
 * n'est pas une image, on dédoublonne par empreinte, on réutilise un ticket
 * identique récent (renvoi / réseau coupé), puis on lit vraiment. Un échec de
 * lecture (illisible, manuscrit, pas un ticket) est explicite et NON facturé.
 */
export const actions: Actions = {
	default: async (event) => {
		const { request, cookies } = event;
		const session = await getAppSession(event);
		const form = await request.formData();

		// 1. Extraire les fichiers (1 à 3), refuser tout ce qui n'est pas une image.
		const files = SLOTS.map((k) => form.get(k)).filter(
			(v): v is File => v instanceof File && v.size > 0
		);
		if (files.length === 0) return fail(400, { erreur: 'aucune' });
		for (const f of files) {
			if (!f.type.startsWith('image/')) return fail(400, { erreur: 'pas_une_image' });
		}

		// 2. Empreintes + dédoublonnage (deux fois la même capture = une seule).
		const images: ImageInput[] = [];
		const hashes: string[] = [];
		const seen = new Set<string>();
		for (const f of files.slice(0, 3)) {
			const bytes = new Uint8Array(await f.arrayBuffer());
			const h = await sha256Hex(bytes);
			if (seen.has(h)) continue;
			seen.add(h);
			hashes.push(h);
			const mime = ALLOWED_MIME.has(f.type) ? f.type : 'image/jpeg';
			images.push({ mime, data: toBase64(bytes) });
		}
		const empreinte = await combinedEmpreinte(hashes);

		// 3. Réutilisation : même capture récente → même ticket, sans relancer l'analyse.
		const deja = await findRecentTicketByEmpreinte(session?.userId ?? null, empreinte);
		if (deja) {
			setTicketCookie(cookies, deja.id);
			redirect(303, '/analyser/validation');
		}

		// 4. Lecture réelle. Échec explicite = message clair, aucun crédit débité.
		const raw = await vision.readTicket(images);
		if (raw.echec) return fail(422, { erreur: raw.echec });

		// 5. Résolution (code) + sauvegarde du ticket avant tout paiement.
		const [fixtures, teams] = await Promise.all([sports.upcomingFixtures(), sports.teams()]);
		const selections = resolveTicket(raw, fixtures, teams);
		const ticket = await createTicket(selections, session?.userId ?? null, empreinte);

		// 6. Stockage des captures (best-effort, purge 30 j) — ne bloque jamais.
		await storeCaptures(ticket.id, images, hashes).catch(() => {});

		setTicketCookie(cookies, ticket.id);
		redirect(303, '/analyser/validation');
	}
};

/** base64 d'un buffer, sans dépendre de Buffer (Node comme edge). */
function toBase64(bytes: Uint8Array): string {
	let bin = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(bin);
}
