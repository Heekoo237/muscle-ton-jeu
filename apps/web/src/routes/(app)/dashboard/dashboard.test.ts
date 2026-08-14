import { describe, it, expect } from 'vitest';
import { load } from './+page.server';

/**
 * Le dashboard d'un compte NEUF — zéro ticket, zéro crédit, zéro résultat en
 * base, mode démo DÉSACTIVÉ (comme en production) — doit se charger SANS erreur.
 * C'est le scénario exact qui renvoyait une 500 (garde-fou vision au chargement
 * du module). Ici on vérifie que le load aboutit et renvoie des structures sûres.
 */
function fakeEvent() {
	const jar = new Map<string, string>([['session', 'demo']]);
	return {
		locals: { supabase: null, safeGetSession: async () => ({ user: null }) },
		cookies: {
			get: (k: string) => jar.get(k),
			set: (k: string, v: string) => jar.set(k, v),
			delete: (k: string) => jar.delete(k)
		},
		url: new URL('http://localhost/dashboard')
	};
}

describe('dashboard — compte neuf, sans données', () => {
	it('se charge sans lever et renvoie des structures sûres', async () => {
		// @ts-expect-error — event factice minimal pour le load.
		const data = (await load(fakeEvent())) as {
			stats: unknown;
			ticketsEnCours: unknown[];
			historique: unknown[];
		};
		expect(data).toBeTruthy();
		expect(Array.isArray(data.ticketsEnCours)).toBe(true);
		expect(Array.isArray(data.historique)).toBe(true);
		expect(data.stats).toBeDefined();
		// Un compte neuf n'a pas de bandeau d'historique (< 20 résultats, démo off).
		expect(data.historique.length).toBe(0);
	});
});
