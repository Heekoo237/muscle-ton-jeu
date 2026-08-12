import type { AuthService, UserSession } from './index';
import { getUser } from '$lib/server/fixtures/userStore';

/**
 * Auth factice basée sur un jeton de session. Déconnecté par défaut : le mur de
 * connexion (PRD §7) apparaît après l'analyse, juste avant le résultat. Le solde
 * de la session reflète le registre de crédits (userStore).
 */
export class FakeAuth implements AuthService {
	async currentSession(token?: string): Promise<UserSession | null> {
		if (token !== 'demo') return null;
		const u = getUser();
		return { userId: u.id, prenom: u.prenom, email: u.email, credits: u.credits };
	}

	async beginGoogleLogin(returnTo: string): Promise<string> {
		// En réel : URL d'autorisation Google. En factice : retour direct après « login ».
		return returnTo;
	}
}
