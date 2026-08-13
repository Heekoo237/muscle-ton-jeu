import type { LayoutServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { hasRecharged } from '$lib/server/fixtures/userStore';

/**
 * Chrome du produit connecté. On ne bloque jamais l'entrée : même sans crédits ni
 * connexion, on compose et on envoie un ticket — seul l'affichage du résultat est
 * protégé. Le solde et « Recharger » n'apparaissent qu'une fois l'utilisateur
 * devenu client crédits (a déjà rechargé).
 */
export const load: LayoutServerLoad = async (event) => {
	const session = await getAppSession(event);
	return {
		connecte: session !== null,
		credits: session?.credits ?? 0,
		prenom: session?.prenom ?? null,
		montreCredits: session ? await hasRecharged(session.userId) : false
	};
};
