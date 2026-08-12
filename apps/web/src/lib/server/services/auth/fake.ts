import type { AuthService, UserSession } from './index';

/**
 * Auth factice : un utilisateur de démonstration doté de crédits. La landing
 * reste consultable sans session ; le mur n'est simulé que dans le parcours.
 */
export class FakeAuth implements AuthService {
	async currentSession(): Promise<UserSession | null> {
		return { userId: 1, prenom: 'Démo', email: 'demo@example.com', credits: 12 };
	}

	async beginGoogleLogin(returnTo: string): Promise<string> {
		// En réel : URL d'autorisation Google. En factice : retour direct.
		return returnTo;
	}
}
