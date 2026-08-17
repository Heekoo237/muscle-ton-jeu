import { describe, it, expect } from 'vitest';
import { choisirAnalyseDuJour, cleDuJour, joursDecart, type CandidatJour } from './daily-analysis';
import type { Market } from '$lib/types';

const P = (o: Partial<Record<Market, number>>) => o;

/** Un ms qui tombe sur le jour civil `dayKey` (UTC+1) — midi UTC est sûr. */
const msLe = (dayKey: string) => Date.parse(`${dayKey}T12:00:00Z`);

/** Le pool de base (probas), daté sur un jour donné. La sélection ne dépend pas de
 *  la date pour le SCORE — seulement pour l'horizon —, donc on peut le rejouer par jour. */
const base = (dayKey: string): CandidatJour[] => {
	const dateMs = msLe(dayKey);
	return [
		// Match serré + nul sous-estimé.
		{ fixtureId: 1, teamHome: 'Rennes', teamAway: 'Lyon', dateMs, probas: P({ WIN_HOME: 0.3, DRAW: 0.38, WIN_AWAY: 0.32, OVER_2_5: 0.58, UNDER_2_5: 0.42 }) },
		// Favori pas si solide (~0,53).
		{ fixtureId: 2, teamHome: 'Milan', teamAway: 'Torino', dateMs, probas: P({ WIN_HOME: 0.53, DRAW: 0.27, WIN_AWAY: 0.2, OVER_2_5: 0.62, UNDER_2_5: 0.38 }) },
		// Plus/moins décisif.
		{ fixtureId: 3, teamHome: 'Bayern', teamAway: 'Fribourg', dateMs, probas: P({ WIN_HOME: 0.55, DRAW: 0.25, WIN_AWAY: 0.2, OVER_2_5: 0.66, UNDER_2_5: 0.34 }) },
		// ÉVIDENCE : gros favori, doit être écarté.
		{ fixtureId: 4, teamHome: 'PSG', teamAway: 'Metz', dateMs, probas: P({ WIN_HOME: 0.85, DRAW: 0.1, WIN_AWAY: 0.05 }) }
	];
};

describe('analyse du jour — déterministe et figée par jour', () => {
	it('même jour → même analyse (rejouée à l’identique, stable à la reconnexion)', () => {
		const a = choisirAnalyseDuJour(base('2026-08-17'), '2026-08-17');
		const b = choisirAnalyseDuJour(base('2026-08-17'), '2026-08-17');
		expect(a).toEqual(b);
		expect(a).not.toBeNull();
		expect(a!.horizon).toBe('jour');
	});

	it('cleDuJour est locale et stable dans la journée', () => {
		const midi = Date.UTC(2026, 7, 17, 11, 0, 0);
		const soir = Date.UTC(2026, 7, 17, 20, 0, 0);
		expect(cleDuJour(midi)).toBe(cleDuJour(soir));
	});

	it('joursDecart compte des jours civils', () => {
		expect(joursDecart('2026-08-17', '2026-08-17')).toBe(0);
		expect(joursDecart('2026-08-17', '2026-08-18')).toBe(1);
		expect(joursDecart('2026-08-17', '2026-08-19')).toBe(2);
	});
});

describe('analyse du jour — jamais un marché non engageant, jamais l’évidence', () => {
	it('JAMAIS de double chance ni de BTTS, sur 40 jours', () => {
		for (let d = 0; d < 40; d++) {
			const k = `2026-09-${String((d % 28) + 1).padStart(2, '0')}`;
			const a = choisirAnalyseDuJour(base(k), k);
			if (!a) continue;
			expect(a.marche).not.toMatch(/^DC_/);
			expect(a.marche).not.toMatch(/^BTTS_/);
		}
	});

	it('un pool où tout est ÉVIDENT (gros favori) → aucune analyse', () => {
		for (let d = 0; d < 6; d++) {
			const k = `2026-10-0${d + 1}`;
			const evident = [base(k)[3]];
			expect(choisirAnalyseDuJour(evident, k)).toBeNull();
		}
	});

	it('le pourcentage affiché est celui du marché choisi', () => {
		const a = choisirAnalyseDuJour(base('2026-08-17'), '2026-08-17');
		expect(a).not.toBeNull();
		expect(a!.probabilitePct).toBeGreaterThan(0);
		expect(a!.probabilitePct).toBeLessThanOrEqual(72);
	});
});

describe('analyse du jour — la famille et le match VARIENT', () => {
	it('sur 21 jours, on voit plusieurs familles (pas toujours la même)', () => {
		const familles = new Set<string>();
		const marches = new Set<string>();
		for (let d = 1; d <= 21; d++) {
			const k = `2026-11-${String(d).padStart(2, '0')}`;
			const a = choisirAnalyseDuJour(base(k), k);
			if (a) {
				familles.add(a.famille);
				marches.add(a.marche);
			}
		}
		expect(familles.size).toBeGreaterThanOrEqual(2);
		expect(marches.size).toBeGreaterThanOrEqual(2);
	});
});

describe('analyse du jour — priorité au jour même, puis 48 h', () => {
	it('rien d’intéressant aujourd’hui → pioche demain et le DIT (horizon=demain)', () => {
		const jour = '2026-08-17';
		const demain = '2026-08-18';
		// Aujourd'hui : seulement de l'évidence (écartée). Demain : un match intéressant.
		const candidats: CandidatJour[] = [
			{ fixtureId: 10, teamHome: 'PSG', teamAway: 'Metz', dateMs: msLe(jour), probas: P({ WIN_HOME: 0.86, DRAW: 0.09, WIN_AWAY: 0.05 }) },
			{ fixtureId: 11, teamHome: 'Milan', teamAway: 'Torino', dateMs: msLe(demain), probas: P({ WIN_HOME: 0.53, DRAW: 0.27, WIN_AWAY: 0.2, OVER_2_5: 0.62, UNDER_2_5: 0.38 }) }
		];
		const a = choisirAnalyseDuJour(candidats, jour);
		expect(a).not.toBeNull();
		expect(a!.horizon).toBe('demain');
		expect(a!.matchLabel).toBe('Milan – Torino');
	});

	it('le jour même est prioritaire : un match intéressant aujourd’hui l’emporte sur demain', () => {
		const jour = '2026-08-17';
		const demain = '2026-08-18';
		const candidats: CandidatJour[] = [
			{ fixtureId: 20, teamHome: 'Rennes', teamAway: 'Lyon', dateMs: msLe(jour), probas: P({ WIN_HOME: 0.3, DRAW: 0.38, WIN_AWAY: 0.32 }) },
			{ fixtureId: 21, teamHome: 'Milan', teamAway: 'Torino', dateMs: msLe(demain), probas: P({ WIN_HOME: 0.53, DRAW: 0.27, WIN_AWAY: 0.2 }) }
		];
		const a = choisirAnalyseDuJour(candidats, jour);
		expect(a).not.toBeNull();
		expect(a!.horizon).toBe('jour');
		expect(a!.matchLabel).toBe('Rennes – Lyon');
	});

	it('rien sur 48 h → null (l’appelant montre le compteur, pas un bloc vide)', () => {
		const jour = '2026-08-17';
		// Un match intéressant mais au-delà de 48 h (J+3) : hors fenêtre.
		const candidats: CandidatJour[] = [
			{ fixtureId: 30, teamHome: 'Milan', teamAway: 'Torino', dateMs: msLe('2026-08-20'), probas: P({ WIN_HOME: 0.53, DRAW: 0.27, WIN_AWAY: 0.2 }) }
		];
		expect(choisirAnalyseDuJour(candidats, jour)).toBeNull();
	});
});
