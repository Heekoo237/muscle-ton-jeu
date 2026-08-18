import { describe, it, expect } from 'vitest';
import { trouverEvenement } from './ondemand';
import { reconnaitreEquipes } from '$lib/server/domain/resolve';
import type { EvenementCotes } from './provider';
import type { Team } from '$lib/types';

/**
 * Extension « match non résolu » : les deux équipes reconnues mais aucun match ne
 * les oppose en base. Ces tests encodent le SCÉNARIO RÉEL constaté (curl Bundesliga)
 * — Dortmund et Bayern existent, mais jouent HSV et Stuttgart, PAS l'un contre
 * l'autre. La bonne issue est alors « pas encore coté », pas une analyse inventée.
 */
const T = (id: number, nom: string, aliases: string[] = []): Team => ({
	id,
	nom,
	aliases,
	leagueId: 5,
	clubId: null
});

const DORTMUND = T(1, 'Borussia Dortmund', ['dortmund', 'bvb']);
const BAYERN = T(2, 'Bayern Munich', ['bayern', 'bayern munchen']);
const HSV = T(3, 'Hamburger SV', ['hamburg', 'hsv']);
const STUTTGART = T(4, 'VfB Stuttgart', ['stuttgart']);
const TEAMS = [DORTMUND, BAYERN, HSV, STUTTGART];

const ev = (id: string, home: string, away: string): EvenementCotes => ({
	eventId: id,
	home,
	away,
	commenceIso: '2026-08-29T16:30:00Z',
	cotes: { WIN_HOME: 1.33, DRAW: 5.5, WIN_AWAY: 8.19 }
});

describe('reconnaitreEquipes — porte d’entrée de l’extension (exigence a)', () => {
	it('reconnaît les deux équipes d’une affiche « A – B »', () => {
		const r = reconnaitreEquipes('Borussia Dortmund – Bayern Munich', TEAMS);
		expect(r.home?.id).toBe(DORTMUND.id);
		expect(r.away?.id).toBe(BAYERN.id);
	});

	it('un côté non reconnu → null (on n’appelle pas, jamais deviné)', () => {
		const r = reconnaitreEquipes('Borussia Dortmund – Équipe Inconnue', TEAMS);
		expect(r.home?.id).toBe(DORTMUND.id);
		expect(r.away).toBeNull();
	});
});

describe('trouverEvenement — le fournisseur oppose-t-il vraiment ces deux équipes ?', () => {
	// La vraie journée : Dortmund–HSV et Bayern–Stuttgart. PAS Dortmund–Bayern.
	const journeeReelle = [
		ev('e1', 'Borussia Dortmund', 'Hamburger SV'),
		ev('e2', 'Bayern Munich', 'VfB Stuttgart')
	];

	it('Dortmund–Bayern demandé mais ABSENT de la journée → null (→ « pas encore coté »)', () => {
		const trouve = trouverEvenement(journeeReelle, DORTMUND, BAYERN, TEAMS);
		expect(trouve).toBeNull();
	});

	it('affiche RÉELLEMENT portée → trouvée, côté lu sur la donnée', () => {
		// Cas fraîcheur : le fournisseur porte bien Dortmund (dom.) – Bayern (ext.).
		const avecKlassiker = [...journeeReelle, ev('e3', 'Borussia Dortmund', 'Bayern Munich')];
		const trouve = trouverEvenement(avecKlassiker, BAYERN, DORTMUND, TEAMS);
		expect(trouve).not.toBeNull();
		expect(trouve!.ev.eventId).toBe('e3');
		// Ordre du ticket inversé (Bayern, Dortmund) mais côté redressé sur l’événement.
		expect(trouve!.homeTeam.id).toBe(DORTMUND.id);
		expect(trouve!.awayTeam.id).toBe(BAYERN.id);
	});

	it('ne confond pas une paire partielle (Dortmund–HSV ≠ Dortmund–Bayern)', () => {
		const trouve = trouverEvenement([ev('e1', 'Borussia Dortmund', 'Hamburger SV')], DORTMUND, BAYERN, TEAMS);
		expect(trouve).toBeNull();
	});
});
