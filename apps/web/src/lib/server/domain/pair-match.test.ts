/**
 * pair-match.test.ts — le rattrapage SANS séparateur (`pairMatchNoSep`).
 *
 * Le principe : quand le libellé du match n'a pas de séparateur reconnu, on cherche
 * DEUX équipes de la base qui se rencontrent dans le texte, en réutilisant les seuils
 * MESURÉS de la paire. On vérifie qu'il résout un vrai match sans séparateur, et qu'il
 * REFUSE plutôt que deviner : une seule équipe, ou deux paires plausibles.
 */
import { describe, it, expect } from 'vitest';
import { pairMatchNoSep } from './pair-match';
import type { Fixture } from '$lib/types';

function fx(id: number, teamHome: string, teamAway: string): Fixture {
	return {
		id,
		dateUtc: '',
		teamHome,
		teamAway,
		teamHomeId: id * 10,
		teamAwayId: id * 10 + 1,
		leagueId: 1,
		statut: 'scheduled',
		scoreHome: null,
		scoreAway: null
	};
}

const fixtures = [fx(1, 'Real Madrid', 'Real Sociedad'), fx(2, 'Barcelona', 'Athletic Bilbao')];

describe('pairMatchNoSep', () => {
	it('résout un match écrit sans séparateur reconnu (« vs »)', () => {
		const r = pairMatchNoSep('Real Madrid vs Real Sociedad', fixtures);
		expect(r.decision).toBe('ok');
		if (r.decision === 'ok') expect(r.fixture.id).toBe(1);
	});

	it('résout avec « contre » — un mot de liaison quelconque', () => {
		const r = pairMatchNoSep('Barcelona contre Athletic Bilbao', fixtures);
		expect(r.decision).toBe('ok');
		if (r.decision === 'ok') expect(r.fixture.id).toBe(2);
	});

	it('résout sans AUCUN séparateur (juste les deux noms)', () => {
		const r = pairMatchNoSep('Real Madrid Real Sociedad', fixtures);
		expect(r.decision).toBe('ok');
		if (r.decision === 'ok') expect(r.fixture.id).toBe(1);
	});

	it('le côté vient du fixture, pas de l’ordre du texte (ordre inversé → même fixture)', () => {
		const r = pairMatchNoSep('Real Sociedad vs Real Madrid', fixtures);
		expect(r.decision).toBe('ok');
		if (r.decision === 'ok') expect(r.fixture.id).toBe(1);
	});

	it('REFUSE quand une seule équipe est présente — on ne devine pas', () => {
		const r = pairMatchNoSep('Real Madrid et rien d’autre ici', fixtures);
		expect(r.decision).not.toBe('ok');
	});

	it('REFUSE une paire inventée : deux équipes qui ne jouent pas l’une contre l’autre', () => {
		// « Real Madrid » et « Barcelona » sont chacun dans un fixture, mais PAS ensemble.
		const r = pairMatchNoSep('Real Madrid Barcelona', fixtures);
		expect(r.decision).not.toBe('ok');
	});

	it('texte vide ou d’un seul mot → aucun', () => {
		expect(pairMatchNoSep('', fixtures).decision).toBe('aucun');
		expect(pairMatchNoSep('Madrid', fixtures).decision).toBe('aucun');
		expect(pairMatchNoSep('Real Madrid vs Real Sociedad', []).decision).toBe('aucun');
	});
});
