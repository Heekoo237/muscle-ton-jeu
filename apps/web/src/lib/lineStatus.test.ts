import { describe, it, expect } from 'vitest';
import { ligneNote, estAnalysee } from './lineStatus';

const base = { analysable: true, probabilitePct: 70.8, retiree: false, fragile: false };

describe('statut de ligne — une non analysée ne porte AUCUN jugement', () => {
	it('résolue mais sans probabilité (ligue non couverte) → non analysée', () => {
		expect(estAnalysee({ analysable: true, probabilitePct: null })).toBe(false);
	});

	it('note d’une ligne sans probabilité : « Non analysé — non facturé », jamais « solide »', () => {
		const note = ligneNote({ analysable: true, probabilitePct: null, retiree: false, fragile: false });
		expect(note).toBe('Non analysé — non facturé.');
		expect(note).not.toContain('solide');
		expect(note).not.toContain('fragile');
	});

	it('marché non résolu → non analysé aussi', () => {
		expect(ligneNote({ analysable: false, probabilitePct: null, retiree: false, fragile: false })).toBe(
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
