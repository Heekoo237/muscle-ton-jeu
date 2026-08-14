import { describe, it, expect } from 'vitest';
import { ligneNote } from './lineStatus';

// Invariant : `analysable` est le booléen déjà tranché par la règle unique
// (isAnalysable) côté serveur — `analysable === true` implique une probabilité.
// Une ligne sans probabilité arrive donc ici avec `analysable: false`.
const base = { analysable: true, retiree: false, fragile: false };

describe('statut de ligne — une non analysée ne porte AUCUN jugement', () => {
	it('non analysable → « Non analysé — non facturé », jamais « solide »/« fragile »', () => {
		const note = ligneNote({ analysable: false, retiree: false, fragile: false });
		expect(note).toBe('Non analysé — non facturé.');
		expect(note).not.toContain('solide');
		expect(note).not.toContain('fragile');
	});

	it('non analysable prime même si des drapeaux traînent (VM incohérent) — aucun jugement', () => {
		expect(ligneNote({ analysable: false, retiree: true, fragile: true })).toBe(
			'Non analysé — non facturé.'
		);
	});

	it('ligne analysée solide → « Sélection solide »', () => {
		expect(ligneNote(base)).toBe('Sélection solide.');
	});

	it('ligne fragile → note fragile ; ligne retirée → note retirée', () => {
		expect(ligneNote({ ...base, fragile: true })).toContain('fragile');
		expect(ligneNote({ ...base, fragile: true, retiree: true })).toContain('Retirée');
	});
});
