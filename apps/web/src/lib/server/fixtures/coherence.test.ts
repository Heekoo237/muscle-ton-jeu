import { describe, it, expect } from 'vitest';
import { analyserFixture } from './coherenceStore';
import type { Market } from '$lib/types';

/** Fabrique les accès proba/cote/source depuis trois tables simples. */
function acces(
	probas: Partial<Record<Market, number>>,
	cotes: Partial<Record<Market, number>> = {},
	sources: Partial<Record<Market, string>> = {}
) {
	return [
		(m: Market) => probas[m] ?? null,
		(m: Market) => cotes[m] ?? null,
		(m: Market) => sources[m] ?? null
	] as const;
}

describe('analyserFixture — cohérence des probabilités (né du cas Rennes–PSG)', () => {
	it('un match sain : rien à signaler', () => {
		const [p, c, s] = acces(
			{ WIN_HOME: 0.16, DRAW: 0.21, WIN_AWAY: 0.63, DC_HOME_DRAW: 0.37, DC_DRAW_AWAY: 0.84, DC_HOME_AWAY: 0.79 },
			{ WIN_HOME: 6.0, WIN_AWAY: 1.5 },
			{ DC_HOME_DRAW: 'cote_derivee', DC_DRAW_AWAY: 'cote_derivee', DC_HOME_AWAY: 'cote_derivee' }
		);
		const a = analyserFixture(p, c, s);
		expect(a.sommeHors100).toBe(false);
		expect(a.dcDerivee).toEqual([]);
		expect(a.flipDc).toEqual([]);
		expect(a.orientationCote).toBeNull();
	});

	it('SOMME 1X2 ≠ 100 % : signalée (dévigeage qui ne normalise pas)', () => {
		const [p, c, s] = acces({ WIN_HOME: 0.4, DRAW: 0.3, WIN_AWAY: 0.4 }); // somme 1,10
		const a = analyserFixture(p, c, s);
		expect(a.sommeHors100).toBe(true);
		expect(a.somme1x2).toBeCloseTo(1.1, 5);
	});

	it('1X2 incomplet (une issue absente) : pas de somme, jamais de faux positif', () => {
		const [p, c, s] = acces({ WIN_HOME: 0.4, DRAW: 0.3 });
		const a = analyserFixture(p, c, s);
		expect(a.somme1x2).toBeNull();
		expect(a.sommeHors100).toBe(false);
	});

	it('DC DÉRIVÉE (cote_derivee) ≠ somme de ses composantes : signalée (bug arithmétique)', () => {
		const [p, c, s] = acces(
			{ WIN_HOME: 0.5, DRAW: 0.3, WIN_AWAY: 0.2, DC_HOME_DRAW: 0.5 }, // attendu 0,80
			{},
			{ DC_HOME_DRAW: 'cote_derivee' }
		);
		const a = analyserFixture(p, c, s);
		expect(a.dcDerivee).toHaveLength(1);
		expect(a.dcDerivee[0].attendu).toBeCloseTo(0.8, 5);
		expect(a.flipDc).toEqual([]);
	});

	it('DC dérivée = somme exacte : tolérée', () => {
		const [p, c, s] = acces(
			{ WIN_HOME: 0.5, DRAW: 0.3, WIN_AWAY: 0.2, DC_HOME_DRAW: 0.8, DC_DRAW_AWAY: 0.5, DC_HOME_AWAY: 0.7 },
			{},
			{ DC_HOME_DRAW: 'cote_derivee', DC_DRAW_AWAY: 'cote_derivee', DC_HOME_AWAY: 'cote_derivee' }
		);
		expect(analyserFixture(p, c, s).dcDerivee).toEqual([]);
	});

	it('DC MODÈLE qui diverge un PEU du 1X2 coté : NORMAL, jamais signalé (modèle vs marché)', () => {
		// C'est ce que sur-comptaient les 169 : la DC modèle et le 1X2 coté diffèrent
		// toujours de quelques points — ce n'est pas un bug.
		const [p, c, s] = acces(
			{ WIN_HOME: 0.5, DRAW: 0.3, WIN_AWAY: 0.2, DC_HOME_DRAW: 0.86 }, // composantes 0,80, écart 0,06
			{},
			{ DC_HOME_DRAW: 'model' }
		);
		const a = analyserFixture(p, c, s);
		expect(a.flipDc).toEqual([]);
		expect(a.dcDerivee).toEqual([]);
	});

	it('FLIP — DC modèle ÉNORMÉMENT au-dessus du 1X2 coté : fixture inversé (match 37)', () => {
		// DC_HOME_DRAW modèle 0,864 (orienté fixture, favori = maison) vs WIN_HOME+DRAW
		// coté 0,371 (orienté fournisseur, maison = outsider). Écart 0,49 = retournement.
		const [p, c, s] = acces(
			{ WIN_HOME: 0.17, DRAW: 0.2, WIN_AWAY: 0.63, DC_HOME_DRAW: 0.864 },
			{},
			{ DC_HOME_DRAW: 'model' }
		);
		const a = analyserFixture(p, c, s);
		expect(a.flipDc).toHaveLength(1);
		expect(a.flipDc[0].dcModele).toBeCloseTo(0.864, 5);
		expect(a.flipDc[0].composantesCote).toBeCloseTo(0.37, 5);
		expect(a.flipDc[0].ecart).toBeGreaterThan(0.25);
	});

	it('ORIENTATION cote — proba et cote se contredisent sur la MÊME ligne', () => {
		// La proba dit maison gagnante (0,63) alors que sa cote est la plus HAUTE (6,0).
		const [p, c, s] = acces(
			{ WIN_HOME: 0.63, DRAW: 0.2, WIN_AWAY: 0.17 },
			{ WIN_HOME: 6.0, WIN_AWAY: 1.5 }
		);
		const a = analyserFixture(p, c, s);
		expect(a.orientationCote).not.toBeNull();
		expect(a.orientationCote?.favProba).toBe('home');
		expect(a.orientationCote?.favCote).toBe('away');
	});

	it('ORIENTATION cote cohérente (favori proba = favori cote) : rien', () => {
		const [p, c, s] = acces(
			{ WIN_HOME: 0.63, DRAW: 0.2, WIN_AWAY: 0.17 },
			{ WIN_HOME: 1.5, WIN_AWAY: 6.0 }
		);
		expect(analyserFixture(p, c, s).orientationCote).toBeNull();
	});

	it('ORIENTATION cote — quasi pile-ou-face : on ne crie pas (écart sous le seuil)', () => {
		const [p, c, s] = acces(
			{ WIN_HOME: 0.4, DRAW: 0.22, WIN_AWAY: 0.38 }, // écart proba 0,02 < 0,05
			{ WIN_HOME: 2.4, WIN_AWAY: 2.5 }
		);
		expect(analyserFixture(p, c, s).orientationCote).toBeNull();
	});

	it('ORIENTATION cote — cote absente : pas de recoupement (jamais deviné)', () => {
		const [p, c, s] = acces({ WIN_HOME: 0.63, DRAW: 0.2, WIN_AWAY: 0.17 });
		expect(analyserFixture(p, c, s).orientationCote).toBeNull();
	});
});
