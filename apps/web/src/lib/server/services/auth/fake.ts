import type { AuthService, UserSession } from './index';
import { memDemoUser } from '$lib/server/fixtures/userStore';

/**
 * Auth factice (repli local). La résolution de session réelle vit dans
 * `lib/server/session.ts` (Supabase Auth) ; ce service reste pour l'interface.
 */
export class FakeAuth implements AuthService {
	async currentSession(token?: string): Promise<UserSession | null> {
		if (token !== 'demo') return null;
		const u = memDemoUser();
		return { userId: u.id, prenom: u.prenom, email: u.email, credits: u.credits };
	}

	async beginGoogleLogin(returnTo: string): Promise<string> {
		// En réel : URL d'autorisation Google. En factice : retour direct après « login ».
		return returnTo;
	}
}
