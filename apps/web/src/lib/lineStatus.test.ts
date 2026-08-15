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

	it('ligne fragile → note fragile ; ligne retirée → note retirée', () => {
		expect(ligneNote({ ...base, fragile: true })).toContain('fragile');
		expect(ligneNote({ ...base, fragile: true, retiree: true })).toContain('Retirée');
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
