import { describe, it, expect } from 'vitest';
import { ligneNote, resumeNonAnalyse } from './lineStatus';

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

	it('ligne fragile → « Ce pari est trop juste » ; ligne retirée → note retirée', () => {
		expect(ligneNote({ ...base, fragile: true })).toBe('Ce pari est trop juste.');
		expect(ligneNote({ ...base, fragile: true, retiree: true })).toContain('Retirée');
	});

	it('« la plus fragile » UNIQUEMENT s’il n’y a qu’un seul retrait', () => {
		const retiree = { analysable: true, retiree: true, fragile: true };
		// Un seul retrait → superlatif autorisé.
		expect(ligneNote(retiree, { retraitUnique: true })).toBe(
			'Retirée du ticket renforcé — sélection la plus fragile.'
		);
		// Plusieurs retraits (ou inconnu) → pas de « LA plus » : deux lignes ne peuvent
		// pas être toutes deux la plus fragile.
		expect(ligneNote(retiree, { retraitUnique: false })).toBe(
			'Retirée du ticket renforcé — sélection fragile.'
		);
		expect(ligneNote(retiree)).not.toContain('la plus');
	});

	it('non analysée AVEC raison → la VRAIE cause, jamais « non couvert » par défaut', () => {
		expect(ligneNote({ analysable: false, retiree: false, fragile: false, raisonNonAnalyse: 'commence' })).toBe(
			'Non analysé — ce match a déjà commencé. Non facturé.'
		);
		expect(
			ligneNote({ analysable: false, retiree: false, fragile: false, raisonNonAnalyse: 'hors_couverture' })
		).toContain('pas au catalogue');
		// Un match commencé ne dit JAMAIS « non couvert » (le bug signalé).
		expect(
			ligneNote({ analysable: false, retiree: false, fragile: false, raisonNonAnalyse: 'commence' })
		).not.toContain('couvert');
	});
});

describe('resumeNonAnalyse — la mention sous le pourcentage reflète la VRAIE raison', () => {
	it('une seule cause, un match → message précis accordé au singulier', () => {
		expect(resumeNonAnalyse(['commence'])).toBe('1 match a déjà commencé');
		expect(resumeNonAnalyse(['hors_couverture'])).toBe("1 match n'est pas au catalogue");
	});

	it('une seule cause, plusieurs matchs → accord au pluriel', () => {
		expect(resumeNonAnalyse(['commence', 'commence'])).toBe('2 matchs ont déjà commencé');
	});

	it('plusieurs causes distinctes → compte neutre, jamais une cause approximative', () => {
		expect(resumeNonAnalyse(['commence', 'hors_couverture', 'non_couvert'])).toBe(
			'3 matchs ne sont pas analysés'
		);
	});

	it('aucune ligne non analysée → chaîne vide', () => {
		expect(resumeNonAnalyse([])).toBe('');
	});
});
