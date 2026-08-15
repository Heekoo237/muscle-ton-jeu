import { describe, it, expect } from 'vitest';
import { teamSimilarity } from './similarity';
import { TAU_PAIRE } from './pair-match';

describe('teamSimilarity — ressemblance de noms d’équipe', () => {
	it('attrape les variantes d’ORTHOGRAPHE (au-dessus du seuil)', () => {
		expect(teamSimilarity('FC Séville', 'Sevilla')).toBeGreaterThanOrEqual(TAU_PAIRE);
		expect(teamSimilarity('Espanol', 'Espanyol')).toBeGreaterThanOrEqual(TAU_PAIRE);
		expect(teamSimilarity('Goztep', 'Göztepe')).toBeGreaterThanOrEqual(TAU_PAIRE);
	});

	it('attrape les AJOUTS de mots par contenance de tokens', () => {
		expect(teamSimilarity('Aris', 'Aris Thessaloniki')).toBe(1);
		expect(teamSimilarity('Newcastle', 'Newcastle United')).toBe(1);
	});

	it('SÉPARE deux clubs d’une même ville distingués par l’affixe (anti-fusion)', () => {
		// Le cas qui a fait tomber la première version : retirer « sg »/« fc » les fusionnait.
		expect(teamSimilarity('Paris SG', 'Paris FC')).toBeLessThan(1);
	});

	it('laisse le SÉMANTIQUE sous le seuil (mission de la carte d’alias)', () => {
		expect(teamSimilarity('Guimaraes', 'Vitoria')).toBeLessThan(TAU_PAIRE);
		expect(teamSimilarity('Corum Belediyespor', 'Corum FK')).toBeLessThan(TAU_PAIRE);
	});

	it('est symétrique et bornée à [0, 1]', () => {
		expect(teamSimilarity('Rayo Vallecano', 'Rayo Vallecano')).toBe(1);
		expect(teamSimilarity('Sevilla', 'FC Séville')).toBeCloseTo(teamSimilarity('FC Séville', 'Sevilla'), 10);
	});
});
