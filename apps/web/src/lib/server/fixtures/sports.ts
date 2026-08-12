/**
 * fixtures/sports.ts — DONNÉES FACTICES. Remplacées en Session 8 par le vrai
 * fournisseur (football-data.org) derrière `services/sports`. Aucune valeur ici
 * n'est affichée telle quelle comme probabilité — les probas viennent de
 * `services/predictions`.
 */
import type { Fixture, Team } from '$lib/types';

export const FAKE_LEAGUES = [
	{ id: 1, nom: 'Premier League', pays: 'Angleterre', actif: true },
	{ id: 2, nom: 'Ligue 1', pays: 'France', actif: true },
	{ id: 3, nom: 'La Liga', pays: 'Espagne', actif: true }
];

export const FAKE_TEAMS: Team[] = [
	{ id: 10, nom: 'Arsenal', aliases: ['arsenal', 'ars'], leagueId: 1 },
	{ id: 11, nom: 'Liverpool', aliases: ['liverpool', 'liv'], leagueId: 1 },
	{ id: 12, nom: 'Manchester United', aliases: ['man utd', 'man united', 'mu'], leagueId: 1 },
	{ id: 13, nom: 'Tottenham', aliases: ['tottenham', 'spurs'], leagueId: 1 },
	{ id: 20, nom: 'Lens', aliases: ['lens', 'rc lens'], leagueId: 2 },
	{ id: 21, nom: 'Nice', aliases: ['nice', 'ogc nice'], leagueId: 2 },
	{ id: 22, nom: 'Marseille', aliases: ['marseille', 'om'], leagueId: 2 },
	{ id: 23, nom: 'Lyon', aliases: ['lyon', 'ol'], leagueId: 2 },
	{ id: 30, nom: 'Real Madrid', aliases: ['real madrid', 'real'], leagueId: 3 },
	{ id: 31, nom: 'Barcelone', aliases: ['barcelone', 'barca', 'fc barcelone'], leagueId: 3 }
];

/** Dates relatives à « maintenant » calculées à la lecture, pour rester dans la fenêtre 7 j. */
function inDays(days: number, hour = 20, minute = 45): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + days);
	d.setUTCHours(hour, minute, 0, 0);
	return d.toISOString();
}

export function fakeFixtures(): Fixture[] {
	return [
		{ id: 100, dateUtc: inDays(1), teamHome: 'Arsenal', teamAway: 'Liverpool', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null },
		{ id: 101, dateUtc: inDays(1, 18, 30), teamHome: 'Manchester United', teamAway: 'Tottenham', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null },
		{ id: 102, dateUtc: inDays(2), teamHome: 'Lens', teamAway: 'Nice', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null },
		{ id: 103, dateUtc: inDays(2, 17), teamHome: 'Marseille', teamAway: 'Lyon', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null },
		{ id: 104, dateUtc: inDays(3), teamHome: 'Real Madrid', teamAway: 'Barcelone', leagueId: 3, statut: 'scheduled', scoreHome: null, scoreAway: null }
	];
}
