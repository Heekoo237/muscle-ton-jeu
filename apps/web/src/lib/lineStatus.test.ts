import { describe, it, expect } from 'vitest';
import { ligneNote, resumeNonAnalyse } from './lineStatus';

// Invariant : `analysable` est le booléen déjà tranché par la règle unique
// (isAnalysable) côté serveur — `analysable === true` implique une probabilité.
// Une ligne sans probabilité arrive donc ici avec `analysable: false`.
const base = { analysable: true, retiree: false, fragile: false };

describe('statut de ligne — une non analysée ne porte AUCUN jugement', () => {
	it('non analysable → cause + « C’est gratuit », jamais « solide »/« fragile »/mot technique', () => {
		const note = ligneNote({ analysable: false, retiree: false, fragile: false });
		expect(note).toBe("On ne l'a pas analysé. C'est gratuit.");
		expect(note).not.toContain('solide');
		expect(note).not.toContain('fragile');
		expect(note).not.toMatch(/facturé|analysable/); // mots techniques bannis
	});

	it('non analysable prime même si des drapeaux traînent (VM incohérent) — aucun jugement', () => {
		expect(ligneNote({ analysable: false, retiree: true, fragile: true })).toBe(
			"On ne l'a pas analysé. C'est gratuit."
		);
	});

	it('ligne analysée solide → « Sélection solide »', () => {
		expect(ligneNote(base)).toBe('Sélection solide.');
	});

	it('ligne fragile → « Ce pari est trop juste » ; ligne retirée → note retirée', () => {
		expect(ligneNote({ ...base, fragile: true })).toBe('Ce pari est trop juste.');
		expect(ligneNote({ ...base, fragile: true, retiree: true })).toContain('Retirée');
	});

	it('ligne SERRÉE gardée → AVERTIT (« risqué »), jamais un mot qui valide', () => {
		const note = ligneNote({ ...base, serree: true });
		expect(note).toBe('Tu peux jouer ce match si tu veux mais c’est fragile.');
		expect(note).toContain('fragile');
		// Jamais un mot qui rassure/valide : le terrain lisait « on l'a validée ».
		expect(note).not.toContain('solide');
		expect(note).not.toMatch(/on la garde/i);
		expect(note).not.toContain('seuil'); // « barre », pas le mot de statisticien
	});

	it('une ligne retirée ou fragile prime sur serrée (pas de double statut)', () => {
		expect(ligneNote({ ...base, fragile: true, serree: true })).toBe('Ce pari est trop juste.');
		expect(ligneNote({ ...base, retiree: true, serree: true })).toContain('Retirée');
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

	it('non analysée AVEC raison → la VRAIE cause + « C’est gratuit », jamais un mot technique', () => {
		expect(ligneNote({ analysable: false, retiree: false, fragile: false, raisonNonAnalyse: 'commence' })).toBe(
			"Ce match a déjà commencé. C'est gratuit."
		);
		// « catalogue » banni → « on ne la suit pas encore ».
		expect(
			ligneNote({ analysable: false, retiree: false, fragile: false, raisonNonAnalyse: 'hors_couverture' })
		).toContain('on ne la suit pas encore');
		// « données » banni → « les infos ».
		expect(
			ligneNote({ analysable: false, retiree: false, fragile: false, raisonNonAnalyse: 'sans_donnee' })
		).toContain('les infos');
		// Un match commencé ne dit JAMAIS « non couvert » (le bug signalé).
		expect(
			ligneNote({ analysable: false, retiree: false, fragile: false, raisonNonAnalyse: 'commence' })
		).not.toContain('couvert');
	});
});

describe('resumeNonAnalyse — la mention sous le pourcentage reflète la VRAIE raison', () => {
	it('une seule cause, un match → message précis accordé au singulier', () => {
		expect(resumeNonAnalyse(['commence'])).toBe('1 match a déjà commencé');
		expect(resumeNonAnalyse(['hors_couverture'])).toBe(
			"1 match porte sur une compétition qu'on ne suit pas encore"
		);
	});

	it('une seule cause, plusieurs matchs → accord au pluriel', () => {
		expect(resumeNonAnalyse(['commence', 'commence'])).toBe('2 matchs ont déjà commencé');
	});

	it('plusieurs causes distinctes → compte neutre, jamais une cause approximative', () => {
		expect(resumeNonAnalyse(['commence', 'hors_couverture', 'non_couvert'])).toBe(
			"3 matchs n'ont pas pu être analysés"
		);
	});

	it('aucune ligne non analysée → chaîne vide', () => {
		expect(resumeNonAnalyse([])).toBe('');
	});
});
