import { describe, it, expect } from 'vitest';
import { detectionStats, SEUIL_DETECTION_FRAGILES } from './detection';

describe('detectionStats — capacité de détection du flag fragile', () => {
	it('sépare la chute des fragiles de celle des solides', () => {
		const rows = [
			{ fragile: true, tombe: true },
			{ fragile: true, tombe: true },
			{ fragile: true, tombe: false },
			{ fragile: false, tombe: false },
			{ fragile: false, tombe: false },
			{ fragile: false, tombe: true }
		];
		const s = detectionStats(rows);
		expect(s.fragilesRegles).toBe(3);
		expect(s.fragilesTombes).toBe(2);
		expect(s.solidesRegles).toBe(3);
		expect(s.solidesTombes).toBe(1);
		expect(s.tauxChuteFragile).toBeCloseTo(2 / 3);
		expect(s.tauxChuteSolide).toBeCloseTo(1 / 3);
	});

	it('taux null quand un seau est vide (jamais de division par zéro)', () => {
		const s = detectionStats([{ fragile: false, tombe: true }]);
		expect(s.tauxChuteFragile).toBeNull();
		expect(s.tauxChuteSolide).toBe(1);
	});

	it('volume insuffisant sous le seuil de matchs fragiles', () => {
		const peu = Array.from({ length: SEUIL_DETECTION_FRAGILES - 1 }, () => ({
			fragile: true,
			tombe: true
		}));
		expect(detectionStats(peu).volumeSuffisant).toBe(false);
		const assez = Array.from({ length: SEUIL_DETECTION_FRAGILES }, () => ({
			fragile: true,
			tombe: false
		}));
		expect(detectionStats(assez).volumeSuffisant).toBe(true);
	});

	it('liste vide → tout à zéro, rien à montrer', () => {
		const s = detectionStats([]);
		expect(s).toMatchObject({
			fragilesRegles: 0,
			solidesRegles: 0,
			tauxChuteFragile: null,
			tauxChuteSolide: null,
			volumeSuffisant: false
		});
	});
});
