import { describe, it, expect } from 'vitest';
import { enHeuresCalmes, heureLocale } from './notif-schedule';

/** Construit un instant UTC à l'heure UTC voulue (déterministe, sans Date.now). */
function utcAt(hourUtc: number): number {
	return Date.UTC(2026, 0, 15, hourUtc, 0, 0);
}

describe('heures calmes — 22 h–7 h heure locale (UTC+1)', () => {
	it('convertit l’heure UTC en heure locale (+1)', () => {
		expect(heureLocale(utcAt(6))).toBe(7); // 6 h UTC = 7 h locale
		expect(heureLocale(utcAt(23))).toBe(0); // 23 h UTC = minuit locale
	});

	it('la nuit locale est calme (pas d’envoi)', () => {
		expect(enHeuresCalmes(utcAt(21))).toBe(true); // 22 h locale
		expect(enHeuresCalmes(utcAt(23))).toBe(true); // 0 h locale
		expect(enHeuresCalmes(utcAt(2))).toBe(true); // 3 h locale
		expect(enHeuresCalmes(utcAt(5))).toBe(true); // 6 h locale
	});

	it('7 h locale est le réveil : ON PEUT envoyer (fin de fenêtre exclue)', () => {
		expect(enHeuresCalmes(utcAt(6))).toBe(false); // 7 h locale — le passage 6 h UTC émet
	});

	it('la journée locale n’est pas calme', () => {
		expect(enHeuresCalmes(utcAt(11))).toBe(false); // 12 h locale
		expect(enHeuresCalmes(utcAt(17))).toBe(false); // 18 h locale
		expect(enHeuresCalmes(utcAt(20))).toBe(false); // 21 h locale
	});
});
