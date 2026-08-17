import { describe, it, expect } from 'vitest';
import { runWithDbMeter, meterQuery, currentDbMeter } from './dbmeter';

describe('dbmeter — compteur de requêtes par requête HTTP', () => {
	it('compte les requêtes DANS un contexte, par table', () => {
		const m = runWithDbMeter(() => {
			meterQuery('fixtures');
			meterQuery('fixtures');
			meterQuery('predictions');
			return currentDbMeter();
		});
		expect(m?.count).toBe(3);
		expect(m?.byTable).toEqual({ fixtures: 2, predictions: 1 });
	});

	it('HORS contexte, meterQuery ne fait rien (jobs, tests) — pas de crash', () => {
		expect(() => meterQuery('fixtures')).not.toThrow();
		expect(currentDbMeter()).toBeNull();
	});

	it('deux contextes sont indépendants (isolation par requête)', () => {
		const a = runWithDbMeter(() => {
			meterQuery('a');
			return currentDbMeter()?.count;
		});
		const b = runWithDbMeter(() => {
			meterQuery('b');
			meterQuery('b');
			return currentDbMeter()?.count;
		});
		expect(a).toBe(1);
		expect(b).toBe(2);
	});
});
