import { describe, it, expect } from 'vitest';
import { shouldRefuseFake } from './guardFake';

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
