import { describe, it, expect, vi } from 'vitest';
import { resolveTicket } from './resolve';
import type { Fixture, Team } from '$lib/types';
import type { RawTicketRead } from '$lib/server/services/vision';

const teams: Team[] = [
	{ id: 10, nom: 'Arsenal', aliases: ['arsenal', 'ars'], leagueId: 1 },
	{ id: 11, nom: 'Liverpool', aliases: ['liverpool', 'liv'], leagueId: 1 },
	{ id: 12, nom: 'Manchester United', aliases: ['man utd', 'man united'], leagueId: 1 },
	{ id: 13, nom: 'Tottenham', aliases: ['tottenham', 'spurs'], leagueId: 1 }
];
const fixtures: Fixture[] = [
	{ id: 100, dateUtc: '', teamHome: 'Arsenal', teamAway: 'Liverpool', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 },
	{ id: 101, dateUtc: '', teamHome: 'Manchester United', teamAway: 'Tottenham', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
];

function raw(...lignes: string[]): RawTicketRead {
	return { lignes: lignes.map((texteBrut) => ({ texteBrut })) };
}

describe('resolveTicket — chemin temps réel, résolution par code', () => {
	it('résout un match + marché couverts avec certitude', () => {
		const [s] = resolveTicket(raw('Arsenal - Liverpool  1X  1.42'), fixtures, teams);
		expect(s.etatResolution).toBe('certain');
		expect(s.fixtureId).toBe(100);
		expect(s.marche).toBe('DC_HOME_DRAW');
		expect(s.libelleFr).toBe('Arsenal ou match nul');
		expect(s.coteSaisie).toBe(1.42);
	});

	it('marque ambigu un « TB » sans seuil et propose les trois choix', () => {
		const [s] = resolveTicket(raw('Man Utd - Tottenham  TB  1.85'), fixtures, teams);
		expect(s.etatResolution).toBe('ambigu');
		expect(s.candidates).toEqual(['OVER_1_5', 'OVER_2_5', 'OVER_3_5']);
	});

	it('marque inconnu un marché non couvert (mi-temps), match reconnu', () => {
		const [s] = resolveTicket(raw('Arsenal - Liverpool  1MT  2.30'), fixtures, teams);
		expect(s.etatResolution).toBe('inconnu');
		expect(s.raison).toBe('non_couvert');
		expect(s.fixtureId).toBe(100);
	});

	it('marque inconnu un match hors calendrier', () => {
		const [s] = resolveTicket(raw('Lens - Nice  BTTS  1.72'), fixtures, teams);
		expect(s.etatResolution).toBe('inconnu');
		expect(s.fixtureId).toBeNull();
	});

	it('attribue un index d’appariement croissant', () => {
		const out = resolveTicket(raw('Arsenal - Liverpool  1  2.1', 'Man Utd - Tottenham  X  3.2'), fixtures, teams);
		expect(out.map((s) => s.ordre)).toEqual([1, 2]);
	});

	// RÉGRESSION (bug réel) : un alias court d'un AUTRE club happe un nom plus long.
	// « Racing de Santander » matche « Racing Club » (argentin, alias « racing ») par mot
	// entier, alors que « Real Racing Club de Santander » ne matche pas (« Club » coupe la
	// contiguïté). Les deux noms « résolvent » (vers les mauvaises entités), aucun fixture
	// ne les oppose → autrefois non_resolu. Le FILET PAIRE doit corriger vers le vrai match.
	it('rattrape par paire quand le nom-par-nom pointe la mauvaise entité (alias court)', () => {
		const teamsRacing: Team[] = [
			{ id: 30, nom: 'Real Racing Club de Santander', aliases: [], leagueId: 3, clubId: 30 },
			{ id: 31, nom: 'Elche CF', aliases: [], leagueId: 3, clubId: 31 },
			{ id: 32, nom: 'Racing Club', aliases: ['racing'], leagueId: 34, clubId: 32 } // décor argentin
		];
		const fixturesRacing: Fixture[] = [
			{ id: 500, dateUtc: '', teamHome: 'Real Racing Club de Santander', teamAway: 'Elche CF', leagueId: 3, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 30, teamAwayId: 31 }
		];
		const ligne: RawTicketRead = {
			lignes: [
				{
					texteBrut: 'Racing de Santander vs Elche  Plus de 2,5 buts  1.22',
					matchText: 'Racing de Santander vs Elche',
					marketText: 'Plus de 2,5 buts',
					coteText: '1.22',
					concept: { famille: 'PLUS_MOINS', direction: 'PLUS', seuil: 2.5 }
				}
			]
		};
		const [s] = resolveTicket(ligne, fixturesRacing, teamsRacing);
		expect(s.fixtureId).toBe(500); // la paire a corrigé vers le vrai Racing de Santander
		expect(s.etatResolution).toBe('certain');
		expect(s.marche).toBe('OVER_2_5');
	});

	// FILET #3 : la vision (non déterministe) déclare parfois NON_COUVERT un marché COUVERT.
	// Le TEXTE prime : si la table de secours le résout avec certitude, on ne croit pas la
	// vision sur parole.
	it('ignore un concept NON_COUVERT quand le texte résout un marché couvert', () => {
		const ligne: RawTicketRead = {
			lignes: [
				{
					texteBrut: 'Arsenal - Liverpool  Plus de 1,5 buts  1.20',
					matchText: 'Arsenal - Liverpool',
					marketText: 'Plus de 1,5 buts',
					coteText: '1.20',
					concept: { famille: 'NON_COUVERT' }
				}
			]
		};
		const [s] = resolveTicket(ligne, fixtures, teams);
		expect(s.etatResolution).toBe('certain');
		expect(s.marche).toBe('OVER_1_5');
	});
});

/* ---- Notations « CHOIX + TYPE » (Betclic : « Paris SG Résultat du match ») ---- */

const teamsFr: Team[] = [
	{ id: 20, nom: 'Lens', aliases: ['lens', 'rc lens'], leagueId: 2 },
	{ id: 21, nom: 'Paris SG', aliases: ['paris sg', 'psg', 'paris saint-germain'], leagueId: 2 },
	{ id: 22, nom: 'Lyon', aliases: ['lyon', 'ol'], leagueId: 2 },
	{ id: 23, nom: 'Rennes', aliases: ['rennes', 'stade rennais'], leagueId: 2 }
];
const fixturesFr: Fixture[] = [
	{ id: 200, dateUtc: '', teamHome: 'Lens', teamAway: 'Paris SG', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 },
	{ id: 201, dateUtc: '', teamHome: 'Lyon', teamAway: 'Rennes', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
];

/** Ligne STRUCTURÉE, comme la vraie vision (match/marché/cote isolés). */
function struct(matchText: string, marketText: string, coteText = '1.80'): RawTicketRead {
	return { lignes: [{ texteBrut: `${matchText}  ${marketText}  ${coteText}`, matchText, marketText, coteText }] };
}

describe('resolveTicket — le CHOIX est collé au type (Betclic)', () => {
	it('« Paris SG Résultat du match (t. rég) » → victoire de l’équipe à l’extérieur', () => {
		const [s] = resolveTicket(struct('Lens - Paris SG', 'Paris SG Résultat du match (t. rég)'), fixturesFr, teamsFr);
		expect(s.etatResolution).toBe('certain');
		expect(s.marche).toBe('WIN_AWAY');
		expect(s.libelleFr).toBe('Paris SG gagne');
	});

	it('« Lens Résultat du match » → victoire domicile ; « Nul » → match nul', () => {
		expect(resolveTicket(struct('Lens - Paris SG', 'Lens Résultat du match'), fixturesFr, teamsFr)[0].marche).toBe('WIN_HOME');
		expect(resolveTicket(struct('Lyon - Rennes', 'Nul Résultat du match (t. rég)'), fixturesFr, teamsFr)[0].marche).toBe('DRAW');
	});

	it('« Paris SG ou Nul Double chance » → double chance domicile+nul (côté away ici)', () => {
		// Paris SG est l'équipe à l'EXTÉRIEUR dans Lens - Paris SG → away + nul.
		const [s] = resolveTicket(struct('Lens - Paris SG', 'Paris SG ou Nul Double chance'), fixturesFr, teamsFr);
		expect(s.marche).toBe('DC_DRAW_AWAY');
	});

	it('un choix qui ne correspond à AUCUNE équipe ni « Nul » reste INCONNU', () => {
		const [s] = resolveTicket(struct('Lens - Paris SG', 'Marseille Résultat du match'), fixturesFr, teamsFr);
		expect(s.etatResolution).toBe('inconnu');
		expect(s.marche).toBeNull();
	});

	it('marché 1X2 reconnu mais issue VIDE → ligne non lue ET compteur de variabilité', () => {
		// Le bug du matin : la vision a rendu « Résultat du match » sans l'issue. Le
		// match est résolu (fixtureId présent) mais le pari est inanalysable, et on
		// journalise le symptôme (marqueur stable, agrégeable par jour).
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const [s] = resolveTicket(struct('Lens - Paris SG', 'Résultat du match (t. rég)'), fixturesFr, teamsFr);
		expect(s.etatResolution).toBe('inconnu');
		expect(s.fixtureId).not.toBeNull();
		expect(spy.mock.calls.flat().join(' ')).toContain('LECTURE INCOMPLÈTE');
		spy.mockRestore();
	});

	it('championnat NON couvert (équipes absentes) → hors_couverture, gardé, jamais « à corriger »', () => {
		const [s] = resolveTicket(struct('Grenoble - Metz', 'Nul Résultat du match (t. rég)'), fixturesFr, teamsFr);
		expect(s.etatResolution).toBe('inconnu');
		expect(s.raison).toBe('hors_couverture');
		expect(s.fixtureId).toBeNull();
	});
});

/* ---- Garde-fou anti-fusion à la résolution (deux clubs d'une même ville) ---- */

describe('resolveTicket — deux clubs distincts ne se confondent jamais', () => {
	// Paris FC (Ligue 2) et Paris SG (Ligue 1) coexistent en base dès qu'on élargit
	// la couverture. Un nom de ticket ambigu ne doit JAMAIS être deviné.
	const paris: Team[] = [
		{ id: 30, nom: 'Paris FC', aliases: ['paris fc'], leagueId: 3 },
		{ id: 31, nom: 'Paris SG', aliases: ['psg', 'paris saint-germain'], leagueId: 2 },
		{ id: 32, nom: 'Lorient', aliases: ['lorient', 'fc lorient'], leagueId: 3 }
	];
	const parisFx: Fixture[] = [
		{ id: 300, dateUtc: '', teamHome: 'Paris FC', teamAway: 'Lorient', leagueId: 3, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 },
		{ id: 301, dateUtc: '', teamHome: 'Paris SG', teamAway: 'Lorient', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
	];

	it('« Paris » seul, ambigu entre deux clubs → INCONNU, jamais deviné', () => {
		const [s] = resolveTicket(raw('Paris - Lorient  1  1.50'), parisFx, paris);
		expect(s.etatResolution).toBe('inconnu');
		expect(s.fixtureId).toBeNull();
	});

	it('« Paris FC » exact → le bon club, pas le PSG', () => {
		const [s] = resolveTicket(raw('Paris FC - Lorient  1  2.10'), parisFx, paris);
		expect(s.etatResolution).toBe('certain');
		expect(s.fixtureId).toBe(300);
	});

	it('« PSG » (alias exact) → Paris SG, pas Paris FC', () => {
		const [s] = resolveTicket(raw('PSG - Lorient  1  1.30'), parisFx, paris);
		expect(s.etatResolution).toBe('certain');
		expect(s.fixtureId).toBe(301);
	});
});

/* ---- Quatre causes DISTINCTES de non-résolution (fin du fourre-tout « non couvert ») ---- */

describe('resolveTicket — la cause de non-résolution est diagnostiquée, pas devinée', () => {
	const T: Team[] = [
		{ id: 1, nom: 'Paris Saint-Germain', aliases: ['paris saint germain'], leagueId: 1 },
		{ id: 2, nom: 'Lens', aliases: ['lens'], leagueId: 1 },
		{ id: 3, nom: 'Sporting Lisbon', aliases: ['sporting lisbon'], leagueId: 2 },
		{ id: 4, nom: 'Braga', aliases: ['braga'], leagueId: 2 }
	];
	const F: Fixture[] = [
		{ id: 100, dateUtc: '', teamHome: 'Paris Saint-Germain', teamAway: 'Lens', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
		// PAS de fixture Sporting Lisbon - Braga → hors fenêtre
	];

	it('alias bookmaker « Paris SG » → « Paris Saint-Germain » (ponctuation ignorée) : résolu', () => {
		const [s] = resolveTicket(raw('Paris SG - Lens  1  1.50'), F, T);
		expect(s.etatResolution).toBe('certain');
		expect(s.fixtureId).toBe(100);
	});

	it('match trouvé mais au-delà de la période analysée → hors_fenetre', () => {
		const far: Fixture[] = [
			...F,
			{ id: 300, dateUtc: '2099-12-31T18:45:00Z', teamHome: 'Sporting Lisbon', teamAway: 'Braga', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
		];
		const [s] = resolveTicket(raw('Sporting Lisbon - Braga  1  1.80'), far, T);
		expect(s.raison).toBe('hors_fenetre');
		expect(s.fixtureId).toBeNull();
	});

	it('équipes reconnues mais AUCUN match entre elles → non_resolu (« on n’a pas retrouvé »), pas hors_fenetre', () => {
		const [s] = resolveTicket(raw('Sporting Lisbon - Braga  1  1.80'), F, T);
		expect(s.raison).toBe('non_resolu');
		expect(s.fixtureId).toBeNull();
	});

	it('nom non reconnu MAIS un candidat existe → non_resolu (alias manquant, pas « non couvert »)', () => {
		// « Sporting Charleroi » partage « sporting » avec Sporting Lisbon sans être
		// ni exact ni contenu par mot entier → candidat trouvé, match non résolu.
		const [s] = resolveTicket(raw('Sporting Charleroi - Lens  1  2.0'), F, T);
		expect(s.raison).toBe('non_resolu');
	});

	it('aucun candidat en base → hors_couverture (championnat vraiment absent)', () => {
		const [s] = resolveTicket(raw('Zzz Belediyespor - Lens  1  2.0'), F, T);
		expect(s.raison).toBe('hors_couverture');
	});

	it('club_id : « Reims » résout le match rattaché à l’entité « Stade de Reims »', () => {
		// Deux entités du MÊME club (clubId commun), le match porte l'entité L2.
		const T2: Team[] = [
			{ id: 996, nom: 'Reims', aliases: [], leagueId: 1, clubId: 996 },
			{ id: 1376, nom: 'Stade de Reims', aliases: [], leagueId: 2, clubId: 996 },
			{ id: 1377, nom: 'USL Dunkerque', aliases: [], leagueId: 2, clubId: 1377 }
		];
		const F2: Fixture[] = [
			{ id: 400, dateUtc: '', teamHome: 'Stade de Reims', teamAway: 'USL Dunkerque', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
		];
		const [s] = resolveTicket(raw('Reims - Dunkerque  Reims ou Nul - Double chance (t. rég)  1.19'), F2, T2);
		expect(s.etatResolution).toBe('certain');
		expect(s.fixtureId).toBe(400);
		expect(s.marche).toBe('DC_HOME_DRAW');
	});

	it('club_id : deux entités « Clermont » d’un même club ne sont PAS ambiguës', () => {
		const T3: Team[] = [
			{ id: 992, nom: 'Clermont', aliases: [], leagueId: 1, clubId: 992 },
			{ id: 1365, nom: 'Clermont', aliases: [], leagueId: 2, clubId: 992 },
			{ id: 1366, nom: 'Saint Etienne', aliases: [], leagueId: 2, clubId: 1366 }
		];
		const F3: Fixture[] = [
			{ id: 401, dateUtc: '', teamHome: 'Saint Etienne', teamAway: 'Clermont', leagueId: 2, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
		];
		const [s] = resolveTicket(raw('Saint Etienne - Clermont  1  2.0'), F3, T3);
		expect(s.etatResolution).toBe('certain');
		expect(s.fixtureId).toBe(401);
	});

	it('alias réel « Corum Belediyespor » → « Çorum FK » (issu des logs) : résolu', () => {
		const T2: Team[] = [
			{ id: 5, nom: 'Galatasaray', aliases: ['galatasaray'], leagueId: 1 },
			{ id: 6, nom: 'Çorum FK', aliases: ['corum fk'], leagueId: 1 }
		];
		const F2: Fixture[] = [
			{ id: 200, dateUtc: '', teamHome: 'Galatasaray', teamAway: 'Çorum FK', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
		];
		const [s] = resolveTicket(raw('Galatasaray - Corum Belediyespor  1  1.5'), F2, T2);
		expect(s.etatResolution).toBe('certain');
		expect(s.fixtureId).toBe(200);
	});
});

/* ---- Match déjà commencé (coup d'envoi passé) — 5e cas de diagnostic ---- */

describe('resolveTicket — un match déjà commencé n’est pas analysé', () => {
	const T: Team[] = [
		{ id: 1, nom: 'Reims', aliases: [], leagueId: 1 },
		{ id: 2, nom: 'Dunkerque', aliases: [], leagueId: 1 },
		{ id: 3, nom: 'Lyon', aliases: [], leagueId: 1 },
		{ id: 4, nom: 'Rennes', aliases: [], leagueId: 1 }
	];
	const past = '2000-01-01T18:45:00Z';
	const future = '';

	it('coup d’envoi passé → raison « commence », gardé, non analysé', () => {
		const F: Fixture[] = [
			{ id: 500, dateUtc: past, teamHome: 'Reims', teamAway: 'Dunkerque', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
		];
		const [s] = resolveTicket(raw('Reims - Dunkerque  1  1.25'), F, T);
		expect(s.etatResolution).toBe('inconnu');
		expect(s.raison).toBe('commence');
		expect(s.fixtureId).toBeNull();
	});

	it('ticket MIXTE : le match à venir est analysé, le commencé seulement signalé', () => {
		const F: Fixture[] = [
			{ id: 500, dateUtc: past, teamHome: 'Reims', teamAway: 'Dunkerque', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 },
			{ id: 501, dateUtc: future, teamHome: 'Lyon', teamAway: 'Rennes', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null, teamHomeId: 1, teamAwayId: 2 }
		];
		const out = resolveTicket(raw('Reims - Dunkerque  1  1.25', 'Lyon - Rennes  1  2.0'), F, T);
		expect(out[0].raison).toBe('commence');
		expect(out[0].fixtureId).toBeNull();
		expect(out[1].etatResolution).toBe('certain');
		expect(out[1].fixtureId).toBe(501);
	});
});
