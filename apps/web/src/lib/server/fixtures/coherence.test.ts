import { describe, it, expect } from 'vitest';
import { analyserFixture } from './coherenceStore';
import type { Market } from '$lib/types';

/** Fabrique les accès proba/cote depuis deux tables simples. */
function acces(
	probas: Partial<Record<Market, number>>,
	cotes: Partial<Record<Market, number>> = {}
) {
	return [
		(m: Market) => probas[m] ?? null,
		(m: Market) => cotes[m] ?? null
	] as const;
}

describe('analyserFixture — cohérence des probabilités (né du cas Rennes–PSG)', () => {
	it('un match sain : rien à signaler', () => {
		const [p, c] = acces(
			{ WIN_HOME: 0.16, DRAW: 0.21, WIN_AWAY: 0.63, DC_HOME_DRAW: 0.37, DC_DRAW_AWAY: 0.84, DC_HOME_AWAY: 0.79 },
			{ WIN_HOME: 6.0, WIN_AWAY: 1.5 }
		);
		const a = analyserFixture(p, c);
		expect(a.sommeHors100).toBe(false);
		expect(a.dc).toEqual([]);
		expect(a.orientation).toBeNull();
	});

	it('SOMME 1X2 ≠ 100 % : signalée (dévigeage qui ne normalise pas)', () => {
		const [p, c] = acces({ WIN_HOME: 0.4, DRAW: 0.3, WIN_AWAY: 0.4 }); // somme 1,10
		const a = analyserFixture(p, c);
		expect(a.sommeHors100).toBe(true);
		expect(a.somme1x2).toBeCloseTo(1.1, 5);
	});

	it('1X2 incomplet (une issue absente) : pas de somme, jamais de faux positif', () => {
		const [p, c] = acces({ WIN_HOME: 0.4, DRAW: 0.3 });
		const a = analyserFixture(p, c);
		expect(a.somme1x2).toBeNull();
		expect(a.sommeHors100).toBe(false);
	});

	it('DOUBLE CHANCE désalignée de ses composantes : signalée', () => {
		const [p, c] = acces({
			WIN_HOME: 0.5, DRAW: 0.3, WIN_AWAY: 0.2,
			DC_HOME_DRAW: 0.5 // attendu 0,80 → écart 0,30
		});
		const a = analyserFixture(p, c);
		expect(a.dc).toHaveLength(1);
		expect(a.dc[0].dc).toBe('DC_HOME_DRAW');
		expect(a.dc[0].attendu).toBeCloseTo(0.8, 5);
	});

	it('DC = somme exacte : tolérée (dérivée arithmétique du 1X2)', () => {
		const [p, c] = acces({
			WIN_HOME: 0.5, DRAW: 0.3, WIN_AWAY: 0.2,
			DC_HOME_DRAW: 0.8, DC_DRAW_AWAY: 0.5, DC_HOME_AWAY: 0.7
		});
		expect(analyserFixture(p, c).dc).toEqual([]);
	});

	it('ORIENTATION — proba et cote se contredisent : LE cas Rennes–PSG', () => {
		// La base donne la MAISON gagnante (0,63) alors que sa cote est la plus HAUTE
		// (6,0) : la proba du favori est posée du mauvais côté. C'est le symptôme exact.
		const [p, c] = acces(
			{ WIN_HOME: 0.63, DRAW: 0.2, WIN_AWAY: 0.17 },
			{ WIN_HOME: 6.0, WIN_AWAY: 1.5 }
		);
		const a = analyserFixture(p, c);
		expect(a.orientation).not.toBeNull();
		expect(a.orientation?.favProba).toBe('home'); // proba dit maison
		expect(a.orientation?.favCote).toBe('away'); // cote dit extérieur
	});

	it('ORIENTATION cohérente (favori proba = favori cote) : rien', () => {
		const [p, c] = acces(
			{ WIN_HOME: 0.63, DRAW: 0.2, WIN_AWAY: 0.17 },
			{ WIN_HOME: 1.5, WIN_AWAY: 6.0 }
		);
		expect(analyserFixture(p, c).orientation).toBeNull();
	});

	it('ORIENTATION — quasi pile-ou-face : on ne crie pas (écart sous le seuil)', () => {
		const [p, c] = acces(
			{ WIN_HOME: 0.4, DRAW: 0.22, WIN_AWAY: 0.38 }, // écart proba 0,02 < 0,05
			{ WIN_HOME: 2.4, WIN_AWAY: 2.5 }
		);
		expect(analyserFixture(p, c).orientation).toBeNull();
	});

	it('ORIENTATION — cote absente : pas de recoupement (jamais deviné)', () => {
		const [p, c] = acces({ WIN_HOME: 0.63, DRAW: 0.2, WIN_AWAY: 0.17 });
		expect(analyserFixture(p, c).orientation).toBeNull();
	});
});
