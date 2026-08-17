import { describe, it, expect, vi } from 'vitest';
import { section } from './section';

describe('section — isolation d’erreur (la page reste utilisable)', () => {
	it('renvoie la valeur en cas de succès', async () => {
		const r = await section('ok', async () => 42, -1);
		expect(r).toBe(42);
	});

	it('retombe sur le repli en cas d’échec, sans relancer', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = await section('ko', async () => {
			throw new Error('base indisponible');
		}, ['repli']);
		expect(r).toEqual(['repli']);
		// L'erreur technique va dans les logs, jamais à l'appelant.
		expect(spy).toHaveBeenCalledOnce();
		spy.mockRestore();
	});
});
