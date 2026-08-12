/**
 * services/auth — Authentification. Connexion Google uniquement (PRD §7), un
 * seul tap. Le mur de connexion est placé APRÈS l'analyse, juste avant le
 * résultat. À terme : Supabase Auth (Google OAuth) derrière cette interface.
 */
export interface UserSession {
	userId: number;
	prenom: string;
	email: string;
	credits: number;
}

export interface AuthService {
	/** Session courante d'après la requête, ou null si non connecté. */
	currentSession(token?: string): Promise<UserSession | null>;
	/** Démarre le flux Google et renvoie l'URL de redirection. */
	beginGoogleLogin(returnTo: string): Promise<string>;
}

import { FakeAuth } from './fake';

/** ← Point de bascule vers Supabase Auth (Google) (Session 8). */
function createAuthService(): AuthService {
	return new FakeAuth();
}

export const auth: AuthService = createAuthService();
