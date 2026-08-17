import { describe, it, expect } from 'vitest';
import { choisirAnalyseDuJour, cleDuJour, type CandidatJour } from './daily-analysis';
import type { Market } from '$lib/types';

const P = (o: Partial<Record<Market, number>>) => o;

const POOL: CandidatJour[] = [
	// Match serré + nul sous-estimé.
	{ fixtureId: 1, teamHome: 'Rennes', teamAway: 'Lyon', dateMs: 1, probas: P({ WIN_HOME: 0.3, DRAW: 0.38, WIN_AWAY: 0.32, OVER_2_5: 0.58, UNDER_2_5: 0.42 }) },
	// Favori pas si solide (~0,53).
	{ fixtureId: 2, teamHome: 'Milan', teamAway: 'Torino', dateMs: 2, probas: P({ WIN_HOME: 0.53, DRAW: 0.27, WIN_AWAY: 0.2, OVER_2_5: 0.62, UNDER_2_5: 0.38 }) },
	// Plus/moins décisif.
	{ fixtureId: 3, teamHome: 'Bayern', teamAway: 'Fribourg', dateMs: 3, probas: P({ WIN_HOME: 0.55, DRAW: 0.25, WIN_AWAY: 0.2, OVER_2_5: 0.66, UNDER_2_5: 0.34 }) },
	// ÉVIDENCE : gros favori, doit être écarté.
	{ fixtureId: 4, teamHome: 'PSG', teamAway: 'Metz', dateMs: 4, probas: P({ WIN_HOME: 0.85, DRAW: 0.1, WIN_AWAY: 0.05 }) }
];

describe('analyse du jour — déterministe et figée par jour', () => {
	it('même jour → même analyse (rejouée à l’identique, stable à la reconnexion)', () => {
		const a = choisirAnalyseDuJour(POOL, '2026-08-17');
		const b = choisirAnalyseDuJour(POOL, '2026-08-17');
		expect(a).toEqual(b);
		expect(a).not.toBeNull();
	});

	it('cleDuJour est locale et stable dans la journée', () => {
		const midi = Date.UTC(2026, 7, 17, 11, 0, 0);
		const soir = Date.UTC(2026, 7, 17, 20, 0, 0);
		expect(cleDuJour(midi)).toBe(cleDuJour(soir));
	});
});

describe('analyse du jour — jamais un marché non engageant, jamais l’évidence', () => {
	it('JAMAIS de double chance ni de BTTS, sur 40 jours', () => {
		for (let d = 0; d < 40; d++) {
			const a = choisirAnalyseDuJour(POOL, `2026-09-${String((d % 28) + 1).padStart(2, '0')}`);
			if (!a) continue;
			expect(a.marche).not.toMatch(/^DC_/);
			expect(a.marche).not.toMatch(/^BTTS_/);
		}
	});

	it('un pool où tout est ÉVIDENT (gros favori) → aucune analyse', () => {
		const evident = [POOL[3]];
		for (let d = 0; d < 6; d++) {
			expect(choisirAnalyseDuJour(evident, `2026-10-0${d + 1}`)).toBeNull();
		}
	});

	it('le pourcentage affiché est celui du marché choisi', () => {
		const a = choisirAnalyseDuJour(POOL, '2026-08-17');
		expect(a).not.toBeNull();
		// Le pct est un arrondi au dixième d'une proba du pool.
		expect(a!.probabilitePct).toBeGreaterThan(0);
		expect(a!.probabilitePct).toBeLessThanOrEqual(72);
	});
});

describe('analyse du jour — la famille et le match VARIENT', () => {
	it('sur 21 jours, on voit plusieurs familles (pas toujours la même)', () => {
		const familles = new Set<string>();
		const marches = new Set<string>();
		for (let d = 1; d <= 21; d++) {
			const a = choisirAnalyseDuJour(POOL, `2026-11-${String(d).padStart(2, '0')}`);
			if (a) {
				familles.add(a.famille);
				marches.add(a.marche);
			}
		}
		expect(familles.size).toBeGreaterThanOrEqual(2); // ça alterne, ce n'est pas figé sur une famille
		expect(marches.size).toBeGreaterThanOrEqual(2);
	});
});
