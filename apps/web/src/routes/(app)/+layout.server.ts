import type { LayoutServerLoad } from './$types';
import { getSession } from '$lib/server/session';
import { hasRecharged } from '$lib/server/fixtures/userStore';

/**
 * Chrome du produit connecté. On ne bloque jamais l'entrée : même sans crédits ni
 * connexion, on compose et on envoie un ticket — seul l'affichage du résultat est
 * protégé.
 *
 * Le solde et le bouton « Recharger » ne s'affichent qu'à partir du moment où
 * l'utilisateur est un client crédits (a déjà rechargé). Pendant l'essai gratuit,
 * la barre reste sobre : l'invitation à recharger vient après l'analyse offerte.
 */
export const load: LayoutServerLoad = async ({ cookies }) => {
	const session = await getSession(cookies);
	return {
		connecte: session !== null,
		credits: session?.credits ?? 0,
		prenom: session?.prenom ?? null,
		montreCredits: await hasRecharged()
	};
};
