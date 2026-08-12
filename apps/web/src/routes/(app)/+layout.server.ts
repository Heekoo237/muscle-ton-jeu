import type { LayoutServerLoad } from './$types';
import { auth } from '$lib/server/services';

/**
 * Chrome du produit connecté. La session est lue côté serveur (factice pour
 * l'instant). On ne bloque jamais l'entrée : même sans crédits, on compose et on
 * envoie un ticket — seul l'affichage du résultat est bloqué (PRD §5.3).
 */
export const load: LayoutServerLoad = async () => {
	const session = await auth.currentSession();
	return { credits: session?.credits ?? 0, prenom: session?.prenom ?? null };
};
