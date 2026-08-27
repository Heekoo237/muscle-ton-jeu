import { describe, it, expect } from 'vitest';
import { pctHonnete } from './format';

// « 0 % » veut dire IMPOSSIBLE. Une proba positive ne doit JAMAIS s'afficher « 0 ».
// Même principe que la règle des mots techniques : un chiffre faux est pire qu'imprécis.
describe('pctHonnete — jamais « 0 % » pour une proba positive', () => {
	it('valeurs normales : 1 décimale, comme avant', () => {
		expect(pctHonnete(0.401)).toBe(40.1);
		expect(pctHonnete(0.124)).toBe(12.4);
		expect(pctHonnete(0.075)).toBe(7.5);
		expect(pctHonnete(0.4)).toBe(40); // entier, pas « 40,0 »
	});

	it('0,1 % reste 0,1 (le seuil du dixième)', () => {
		expect(pctHonnete(0.001)).toBe(0.1);
	});

	it('SOUS le dixième : on révèle le chiffre réel, jamais 0', () => {
		expect(pctHonnete(0.0004)).toBe(0.04); // 0,04 % (le cas signalé) — pas « 0 »
		expect(pctHonnete(0.00004)).toBe(0.004); // 0,004 %
		expect(pctHonnete(0.000004)).toBe(0.0004); // 0,0004 %
	});

	it('parlay extrême sous 0,0001 % : plancher d’affichage, jamais 0', () => {
		expect(pctHonnete(1e-9)).toBe(0.0001); // microscopique mais POSITIF → jamais « 0 »
	});

	it('une proba VRAIMENT nulle reste 0 (ex. non analysable)', () => {
		expect(pctHonnete(0)).toBe(0);
		expect(pctHonnete(-1)).toBe(0);
	});
});
