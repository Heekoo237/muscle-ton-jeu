import { describe, it, expect } from 'vitest';
import {
	checkVocabulary,
	checkNumbers,
	extractNumbers,
	checkGeneratedText
} from './guards';

describe('checkVocabulary — règle d’or n°2', () => {
	it('accepte un texte conforme au ton du produit', () => {
		const t = 'Ton ticket tient debout. Trois sélections sont fragiles, on les retire.';
		expect(checkVocabulary(t).ok).toBe(true);
	});

	it('refuse les termes interdits et leurs flexions', () => {
		expect(checkVocabulary('un ticket gagnant').hits).toContain('gagnant');
		expect(checkVocabulary('résultat garanti').hits).toContain('garanti');
		expect(checkVocabulary('une méthode infaillible').ok).toBe(false);
		expect(checkVocabulary('des gains assurés').hits).toContain('gains');
		expect(checkVocabulary('a fixed match').hits).toContain('fixed');
	});

	it('« sûr » est interdit mais la préposition « sur » reste permise', () => {
		expect(checkVocabulary('un pari sûr').hits).toContain('sûr');
		expect(checkVocabulary('une analyse sur ton ticket').ok).toBe(true);
	});

	it('« précision » seul est refusé, mais accepté avec « rendement »', () => {
		expect(checkVocabulary('notre précision est élevée').ok).toBe(false);
		expect(
			checkVocabulary('la précision et le rendement à mise fixe sont affichés').ok
		).toBe(true);
	});
});

describe('extractNumbers — format français', () => {
	it('lit virgule décimale, pourcentage et séparateurs de milliers', () => {
		expect(extractNumbers('7,5 %')).toEqual([7.5]);
		expect(extractNumbers('de 1,3 % à 7,5 %')).toEqual([1.3, 7.5]);
		expect(extractNumbers('3 matchs retirés')).toEqual([3]);
		expect(extractNumbers('un plafond de 20 000 F')).toEqual([20000]);
	});
});

describe('checkNumbers — règle d’or n°1', () => {
	const allowed = [1.3, 7.5, 3]; // valeurs déjà calculées, forme d’affichage

	it('accepte un texte dont tous les nombres sont autorisés', () => {
		const t = '3 matchs retirés. Tes chances passent de 1,3 % à 7,5 %.';
		expect(checkNumbers(t, allowed).ok).toBe(true);
	});

	it('signale un nombre fabriqué absent du JSON d’entrée', () => {
		const t = 'Tes chances passent de 1,3 % à 9,9 %.'; // 9,9 n’existe pas
		const r = checkNumbers(t, allowed);
		expect(r.ok).toBe(false);
		expect(r.offending).toContain(9.9);
	});

	it('tolère l’arrondi au dixième via epsilon', () => {
		expect(checkNumbers('environ 7,5 %', [7.52]).ok).toBe(true);
	});
});

describe('checkGeneratedText — contrôle combiné', () => {
	it('échoue si un chiffre est fabriqué OU si un terme est interdit', () => {
		expect(checkGeneratedText('passe à 7,5 %', [7.5]).ok).toBe(true);
		expect(checkGeneratedText('passe à 8,0 %', [7.5]).ok).toBe(false);
		expect(checkGeneratedText('un ticket gagnant à 7,5 %', [7.5]).ok).toBe(false);
	});
});
