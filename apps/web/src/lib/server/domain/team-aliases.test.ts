import { describe, it, expect } from 'vitest';
import { TEAM_ALIASES, aliasFor } from './team-aliases';

// Même discipline que la carte Python : explicite, normalisée, aucune fusion.
describe('team-aliases — carte curée, aucune fusion automatique', () => {
	it('aucune entrée ne se mappe sur elle-même (une entrée inutile est un bruit)', () => {
		for (const [k, v] of Object.entries(TEAM_ALIASES)) expect(k).not.toBe(v);
	});

	it('clés et valeurs sont NORMALISÉES (minuscules, sans accent ni ponctuation)', () => {
		for (const [k, v] of Object.entries(TEAM_ALIASES)) {
			expect(k).toMatch(/^[a-z0-9 ]+$/);
			expect(v).toMatch(/^[a-z0-9 ]+$/);
		}
	});

	it('deux noms bookmaker distincts ne pointent JAMAIS vers la même cible (anti-fusion)', () => {
		// Analogue app du test de co-occurrence : un alias ne doit pas collapser deux
		// clubs distincts en un seul. Deux clés → deux cibles distinctes.
		const cibles = Object.values(TEAM_ALIASES);
		expect(new Set(cibles).size).toBe(cibles.length);
	});

	it('aliasFor renvoie la cible connue, sinon le nom inchangé', () => {
		expect(aliasFor('paris sg')).toBe('paris saint germain');
		expect(aliasFor('arsenal')).toBe('arsenal');
	});

	// EXONYMES traduits par TOKEN : mordent quel que soit l'habillage du nom. C'est ce qui
	// a supprimé l'intermittence Inter–Napoli (« SSC Naples » un coup, « Naples » nu l'autre).
	it('un exonyme est traduit par token, seul ou noyé dans un nom composé', () => {
		expect(aliasFor('seville')).toBe('sevilla'); // exonyme FR seul → nom Odds API
		expect(aliasFor('naples')).toBe('napoli'); // « Naples » nu → « Napoli »
		expect(aliasFor('ssc naples')).toBe('ssc napoli'); // habillage bookmaker → token traduit
		expect(aliasFor('fc naples')).toBe('fc napoli');
	});

	it('un nom sans exonyme ni alias reste rigoureusement inchangé', () => {
		expect(aliasFor('inter milan')).toBe('inter milan');
		expect(aliasFor('napoli')).toBe('napoli'); // déjà le nom de base, pas de double-traduction
	});
});
