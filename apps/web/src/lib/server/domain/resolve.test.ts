import { describe, it, expect } from 'vitest';
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
	{ id: 100, dateUtc: '', teamHome: 'Arsenal', teamAway: 'Liverpool', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null },
	{ id: 101, dateUtc: '', teamHome: 'Manchester United', teamAway: 'Tottenham', leagueId: 1, statut: 'scheduled', scoreHome: null, scoreAway: null }
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
});
