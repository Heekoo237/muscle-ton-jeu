import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { vision, sports } from '$lib/server/services';
import type { ImageInput } from '$lib/server/services/vision';
import { resolveTicket, incompleteReads } from '$lib/server/domain/resolve';
import { createTicket } from '$lib/server/fixtures/ticketStore';
import { recordVisionRead } from '$lib/server/fixtures/visionStatsStore';
import {
	sha256Hex,
	combinedEmpreinte,
	findRecentTicketByEmpreinte,
	storeCaptures
} from '$lib/server/fixtures/captureStore';
import { getAppSession } from '$lib/server/session';

// Fenêtre d'exécution de la fonction Vercel. SANS ce réglage, la valeur par
// défaut de la plateforme (≈10 s) coupe la fonction AVANT nos propres garde-fous
// d'appel IA (AbortController) — l'utilisateur voit un 504 puis un résultat au
// rafraîchissement. La lecture vision peut être RELANCÉE une fois (2 × 25 s), d'où
// 60 s : borne haute compatible Hobby comme Pro, jamais atteinte par un appel sain.
export const config = { maxDuration: 60 };

const SLOTS = ['capture_0', 'capture_1', 'capture_2'];
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Retry vision CIBLÉ : une « lecture incomplète » (marché 1X2/DC reconnu, issue
// vide) signale que la vision a manqué l'issue pariée. On relance la lecture UNE
// SEULE fois — jamais deux — sur la même capture. Nombre nommé, pas en dur.
const RETRY_LECTURE_INCOMPLETE = 1;

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

		// 3. Réutilisation : même capture récente (même utilisateur) → même ticket, sans
		// relancer l'analyse ni refacturer. On la rend VISIBLE (`?reutilise=1`) : un
		// ticket déjà analysé va droit au résultat avec une bannière ; sinon on reprend
		// la validation. Jamais de blocage lié aux tickets d'AUTRES utilisateurs.
		const deja = await findRecentTicketByEmpreinte(session?.userId ?? null, empreinte);
		if (deja) {
			setTicketCookie(cookies, deja.id);
			if (deja.statut === 'analyse') redirect(303, '/resultat?reutilise=1');
			redirect(303, '/analyser/validation?reutilise=1');
		}

		// 4. Lecture réelle. Échec explicite = message clair, aucun crédit débité.
		//    Un service indisponible (ex. clé vision absente en production) ne doit
		//    jamais afficher une 500 brute : message lisible, cause en logs.
		let raw;
		try {
			raw = await vision.readTicket(images);
		} catch (e) {
			console.error('[analyse] lecture indisponible:', e);
			return fail(503, { erreur: 'indisponible' });
		}
		if (raw.echec) return fail(422, { erreur: raw.echec });

		// Trace de diagnostic : ce que la VISION a réellement extrait (texte brut),
		// avant toute résolution. Permet de voir si un « à corriger » vient d'une
		// mauvaise lecture (vision) ou d'une notation absente de la table (résolution).
		console.log('[vision] lecture brute:', JSON.stringify(raw.lignes));

		// 5. Résolution (code) + sauvegarde du ticket avant tout paiement.
		// Fenêtre de RÉSOLUTION : large ET incluant les matchs déjà commencés, pour
		// distinguer « trop loin », « pas retrouvé » et « déjà commencé ».
		const [fixtures, teams] = await Promise.all([
			sports.resolutionFixtures(),
			sports.teams()
		]);
		let selections = resolveTicket(raw, fixtures, teams);

		// Retry CIBLÉ sur lecture incomplète : la vision a reconnu le marché mais
		// manqué l'issue. On relance UNE fois (RETRY_LECTURE_INCOMPLETE) et on garde
		// la lecture qui laisse le MOINS de lignes incomplètes. Journalisé pour
		// mesurer l'efficacité : si le retry ne récupère presque rien, on le retire.
		let incomplets = incompleteReads(selections, raw);
		let retries = 0;
		let retryReussi = 0;
		for (let essai = 0; essai < RETRY_LECTURE_INCOMPLETE && incomplets > 0; essai++) {
			const avant = incomplets;
			let raw2;
			try {
				raw2 = await vision.readTicket(images);
			} catch {
				break; // un retry qui échoue ne casse jamais l'analyse : on garde la 1re lecture
			}
			retries += 1;
			if (raw2.echec) break;
			const sel2 = resolveTicket(raw2, fixtures, teams);
			const apres = incompleteReads(sel2, raw2);
			console.warn(
				`[vision-retry] tenté : ${avant} incomplète(s) → ${apres} ` +
					`(récupérées ${Math.max(0, avant - apres)})`
			);
			if (apres < avant) {
				raw = raw2;
				selections = sel2;
				incomplets = apres;
				retryReussi = 1;
			}
			break; // un seul retry, quoi qu'il arrive
		}

		// Mesure quotidienne (best-effort — ne bloque jamais l'analyse) : lignes lues,
		// incomplètes restantes, retries et leurs succès. Lue par la surveillance.
		await recordVisionRead(selections.length, incomplets, retries, retryReussi).catch(() => {});

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
