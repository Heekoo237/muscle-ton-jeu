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
	{ id: 3, nom: 'La Liga', pays: 'Espagne', actif: true },
	{ id: 4, nom: 'Bundesliga', pays: 'Allemagne', actif: true }
];

export const FAKE_TEAMS: Team[] = [
	{ id: 10, nom: 'Arsenal', aliases: ['arsenal', 'ars'], leagueId: 1 },
	{ id: 11, nom: 'Liverpool', aliases: ['liverpool', 'liv'], leagueId: 1 },
	{ id: 12, nom: 'Manchester United', aliases: ['man utd', 'man united', 'mu'], leagueId: 1 },
	{ id: 13, nom: 'Tottenham', aliases: ['tottenham', 'spurs'], leagueId: 1 },
	{ id: 14, nom: 'Chelsea', aliases: ['chelsea', 'che'], leagueId: 1 },
	{ id: 15, nom: 'Manchester City', aliases: ['man city', 'city', 'mc'], leagueId: 1 },
	{ id: 20, nom: 'Lens', aliases: ['lens', 'rc lens'], leagueId: 2 },
	{ id: 21, nom: 'Nice', aliases: ['nice', 'ogc nice'], leagueId: 2 },
	{ id: 22, nom: 'Marseille', aliases: ['marseille', 'om'], leagueId: 2 },
	{ id: 23, nom: 'Lyon', aliases: ['lyon', 'ol'], leagueId: 2 },
	{ id: 24, nom: 'Paris Saint-Germain', aliases: ['psg', 'paris', 'paris sg'], leagueId: 2 },
	{ id: 25, nom: 'Monaco', aliases: ['monaco', 'asm'], leagueId: 2 },
	{ id: 30, nom: 'Real Madrid', aliases: ['real madrid', 'real'], leagueId: 3 },
	{ id: 31, nom: 'Barcelone', aliases: ['barcelone', 'barca', 'fc barcelone'], leagueId: 3 },
	{ id: 32, nom: 'Atletico Madrid', aliases: ['atletico madrid', 'atletico', 'atleti'], leagueId: 3 },
	{ id: 33, nom: 'Séville', aliases: ['seville', 'sevilla', 'fc seville'], leagueId: 3 },
	{ id: 40, nom: 'Dortmund', aliases: ['dortmund', 'bvb'], leagueId: 4 },
	{ id: 41, nom: 'Leipzig', aliases: ['leipzig', 'rb leipzig'], leagueId: 4 }
];

/** Dates relatives à « maintenant » calculées à la lecture, pour rester dans la fenêtre 7 j. */
function inDays(days: number, hour = 20, minute = 45): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + days);
	d.setUTCHours(hour, minute, 0, 0);
	return d.toISOString();
}

export function fakeFixtures(): Fixture[] {
	const s = (
		id: number,
		days: number,
		teamHome: string,
		teamAway: string,
		leagueId: number
	): Fixture => ({
		id,
		dateUtc: inDays(days),
		teamHome,
		teamAway,
		// Repli local : orientation = id du match (pas de vraies équipes en base ici).
		teamHomeId: id * 10 + 1,
		teamAwayId: id * 10 + 2,
		leagueId,
		statut: 'scheduled',
		scoreHome: null,
		scoreAway: null
	});
	return [
		s(100, 1, 'Arsenal', 'Liverpool', 1),
		s(101, 1, 'Manchester United', 'Tottenham', 1),
		s(102, 2, 'Lens', 'Nice', 2),
		s(103, 2, 'Marseille', 'Lyon', 2),
		s(104, 3, 'Real Madrid', 'Barcelone', 3),
		s(105, 2, 'Chelsea', 'Manchester City', 1),
		s(106, 3, 'Paris Saint-Germain', 'Monaco', 2),
		s(107, 3, 'Atletico Madrid', 'Séville', 3),
		s(108, 4, 'Dortmund', 'Leipzig', 4)
	];
}
