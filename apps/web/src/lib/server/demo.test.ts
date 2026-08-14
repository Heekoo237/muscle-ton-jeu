import { describe, it, expect } from 'vitest';
import { demoEnabled } from './demo';

describe('mode démo — désactivé par défaut, jamais rallumé par accident', () => {
	it('seule la valeur exacte « true » active la démo', () => {
		expect(demoEnabled('true')).toBe(true);
		expect(demoEnabled('TRUE')).toBe(true);
		expect(demoEnabled('  true  ')).toBe(true);
	});

	it('absent, vide ou toute autre valeur → ÉTEINT', () => {
		expect(demoEnabled(undefined)).toBe(false);
		expect(demoEnabled('')).toBe(false);
		expect(demoEnabled('false')).toBe(false);
		expect(demoEnabled('1')).toBe(false);
		expect(demoEnabled('yes')).toBe(false);
		expect(demoEnabled('oui')).toBe(false);
	});
});
