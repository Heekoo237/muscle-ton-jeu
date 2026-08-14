import { describe, it, expect } from 'vitest';
import { GET } from './+server';

/**
 * Un échec d'authentification ne doit JAMAIS exposer d'erreur technique (500).
 * Le callback doit toujours aboutir à une redirection lisible — vers
 * /connexion?erreur=auth en cas d'échec, jamais une exception brute.
 */
type Redir = { status: number; location: string };

/** Exécute le handler et renvoie la redirection levée (status + location). */
async function run(event: unknown): Promise<Redir> {
	try {
		// @ts-expect-error — event factice minimal pour le handler.
		await GET(event);
	} catch (e) {
		const r = e as Partial<Redir>;
		if (typeof r.status === 'number' && typeof r.location === 'string') {
			return { status: r.status, location: r.location };
		}
		throw e; // une vraie erreur technique s'est échappée : c'est le bug qu'on interdit
	}
	throw new Error('le handler n’a pas redirigé');
}

function baseEvent(over: Record<string, unknown> = {}) {
	return {
		url: new URL('http://localhost/auth/callback?code=abc&next=%2Fdashboard'),
		cookies: { get: () => undefined },
		locals: {
			supabase: { auth: {} },
			safeGetSession: async () => ({ user: null })
		},
		...over
	};
}

describe('callback OAuth — échecs sans 500', () => {
	it('échange du code en erreur → /connexion?erreur=auth (pas de 500)', async () => {
		const event = baseEvent();
		(event.locals.supabase.auth as Record<string, unknown>).exchangeCodeForSession = async () => ({
			error: new Error('code invalide')
		});
		const r = await run(event);
		expect(r.status).toBe(303);
		expect(r.location).toContain('/connexion?erreur=auth');
		expect(r.location).toContain('retour=');
	});

	it('échange du code qui LÈVE une exception → redirection lisible, pas d’erreur brute', async () => {
		const event = baseEvent();
		(event.locals.supabase.auth as Record<string, unknown>).exchangeCodeForSession = async () => {
			throw new Error('réseau/PKCE');
		};
		const r = await run(event);
		expect(r.status).toBe(303);
		expect(r.location).toContain('erreur=auth');
	});

	it('Google renvoie ?error=access_denied → /connexion?erreur=auth', async () => {
		const event = baseEvent({
			url: new URL('http://localhost/auth/callback?error=access_denied&next=%2Fresultat')
		});
		const r = await run(event);
		expect(r.status).toBe(303);
		expect(r.location).toContain('erreur=auth');
		expect(r.location).toContain('retour=%2Fresultat');
	});

	it('session absente après échange → échec lisible (pas de 500)', async () => {
		const event = baseEvent();
		(event.locals.supabase.auth as Record<string, unknown>).exchangeCodeForSession = async () => ({
			error: null
		});
		// safeGetSession renvoie déjà { user: null } → doit basculer en échec lisible.
		const r = await run(event);
		expect(r.status).toBe(303);
		expect(r.location).toContain('erreur=auth');
	});

	it('sans code ni erreur → simple redirection vers next (comportement inchangé)', async () => {
		const event = baseEvent({
			url: new URL('http://localhost/auth/callback?next=%2Fdashboard'),
			locals: { supabase: null, safeGetSession: async () => ({ user: null }) }
		});
		const r = await run(event);
		expect(r.status).toBe(303);
		expect(r.location).toBe('/dashboard');
		expect(r.location).not.toContain('erreur');
	});
});
