import type { LayoutServerLoad } from './$types';
import { getSession } from '$lib/server/session';

/**
 * Chrome du produit connecté. La session est lue depuis le cookie (factice pour
 * l'instant). On ne bloque jamais l'entrée : même sans crédits ni connexion, on
 * compose et on envoie un ticket — seul l'affichage du résultat est protégé.
 */
export const load: LayoutServerLoad = async ({ cookies }) => {
	const session = await getSession(cookies);
	return {
		connecte: session !== null,
		credits: session?.credits ?? 0,
		prenom: session?.prenom ?? null
	};
};
