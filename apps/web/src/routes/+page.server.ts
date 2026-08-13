import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';

/**
 * Landing : on n'a besoin que de l'état de session pour la barre du haut
 * (« Se connecter » vs « Mon compte »). Aucune donnée sensible.
 */
export const load: PageServerLoad = async (event) => {
	const session = await getAppSession(event);
	return { connecte: session !== null };
};
