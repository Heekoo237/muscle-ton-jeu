import { describe, it, expect } from 'vitest';
import { serreMesureStats } from './serreMesure';

describe('serreMesureStats — serré vs solide, règlement déterministe', () => {
	it('compte et calcule les taux de chute par seau', () => {
		const s = serreMesureStats([
			{ serre: true, tombe: true },
			{ serre: true, tombe: false },
			{ serre: true, tombe: true },
			{ serre: false, tombe: false },
			{ serre: false, tombe: false },
			{ serre: false, tombe: true }
		]);
		expect(s.serreesReglees).toBe(3);
		expect(s.serreesTombees).toBe(2);
		expect(s.solidesReglees).toBe(3);
		expect(s.solidesTombees).toBe(1);
		expect(s.tauxChuteSerre).toBeCloseTo(2 / 3);
		expect(s.tauxChuteSolide).toBeCloseTo(1 / 3);
		expect(s.ecart).toBeCloseTo(1 / 3);
	});

	it('un seau vide → taux null, écart null (jamais une division par zéro)', () => {
		const s = serreMesureStats([{ serre: true, tombe: true }]);
		expect(s.tauxChuteSolide).toBeNull();
		expect(s.ecart).toBeNull();
	});

	it('assez : faux sous le volume minimum (le seau rare est la contrainte)', () => {
		const peu = serreMesureStats(Array(10).fill({ serre: true, tombe: false }));
		expect(peu.assez).toBe(false);
		const assez = serreMesureStats(Array(20).fill({ serre: true, tombe: false }));
		expect(assez.assez).toBe(true);
	});

	it('aucune donnée → tout à zéro, rien de faux', () => {
		const s = serreMesureStats([]);
		expect(s.serreesReglees).toBe(0);
		expect(s.tauxChuteSerre).toBeNull();
		expect(s.assez).toBe(false);
	});
});
