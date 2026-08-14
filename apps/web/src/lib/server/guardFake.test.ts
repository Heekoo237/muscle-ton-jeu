import { describe, it, expect } from 'vitest';
import { shouldRefuseFake, guardFakeService, FakeServiceError } from './guardFake';

describe('shouldRefuseFake — factice interdit en production', () => {
	it('production + factice → refus', () => {
		expect(shouldRefuseFake(true, false)).toBe(true);
	});
	it('production + réel → autorisé', () => {
		expect(shouldRefuseFake(true, true)).toBe(false);
	});
	it('hors production (dev/build) + factice → autorisé', () => {
		expect(shouldRefuseFake(false, false)).toBe(false);
	});
	it('hors production + réel → autorisé', () => {
		expect(shouldRefuseFake(false, true)).toBe(false);
	});
});

describe('guardFakeService — refus à l’usage, jamais à l’import', () => {
	// En test, on n'est pas en runtime de production : le service est renvoyé tel
	// quel. L'essentiel ici : CONSTRUIRE ne lève jamais (c'était le bug qui faisait
	// planter le dashboard). Le refus en production se fait à l'appel de méthode.
	it('ne lève pas à la construction (même factice)', () => {
		const impl = { hello: () => 'ok' };
		expect(() => guardFakeService('x', false, impl)).not.toThrow();
	});

	it('hors production, l’implémentation factice reste utilisable', () => {
		const impl = { hello: () => 'ok' };
		expect(guardFakeService('x', false, impl).hello()).toBe('ok');
	});

	it('un service réel est renvoyé inchangé', () => {
		const impl = { hello: () => 'réel' };
		expect(guardFakeService('x', true, impl)).toBe(impl);
	});

	it('FakeServiceError nomme le service et n’est pas une 500 muette', () => {
		const e = new FakeServiceError('vision (lecture des captures)');
		expect(e.service).toBe('vision (lecture des captures)');
		expect(e.message).toContain('vision');
	});
});
