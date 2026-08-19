import { describe, it, expect } from 'vitest';
import {
	classer,
	coteCombinee,
	choisirExemples,
	libelleDate,
	NB_EXEMPLES,
	type LignePublique,
	type TicketPublic
} from './publicHistory';

const OFFSET = 3_600_000; // UTC+1

function ligne(p: Partial<LignePublique> = {}): LignePublique {
	return {
		matchLabel: 'A - B',
		libelleFr: 'A ou nul',
		cote: 1.5,
		retiree: false,
		tombe: false,
		...p
	};
}

function ticket(p: Partial<TicketPublic> = {}): TicketPublic {
	const lignes = p.lignes ?? [ligne()];
	return {
		id: 1,
		analyseLeMs: 0,
		bascule: 'sauve',
		lignes,
		coteCombinee: coteCombinee(lignes),
		...p
	};
}

describe('classer — effet du retrait comparé au ticket original', () => {
	it('sauve : perdu tel quel, gagnant après retrait', () => {
		expect(classer('tombe', 'passe')).toBe('sauve');
	});

	it('tombe_malgre : renforcé tombé (⇒ original tombé)', () => {
		expect(classer('tombe', 'tombe')).toBe('tombe_malgre');
	});

	it('passe_quand_meme : passait déjà, retrait sans effet', () => {
		expect(classer('passe', 'passe')).toBe('passe_quand_meme');
	});

	it('null quand un verdict est en attente', () => {
		expect(classer('en_attente', 'passe')).toBeNull();
		expect(classer('tombe', 'en_attente')).toBeNull();
		expect(classer('en_attente', 'en_attente')).toBeNull();
	});
});

describe('coteCombinee — produit des cotes gardées, un fait affiché', () => {
	it('multiplie uniquement les lignes gardées (non retirées)', () => {
		const lignes = [
			ligne({ cote: 2, retiree: false }),
			ligne({ cote: 3, retiree: false }),
			ligne({ cote: 5, retiree: true }) // retirée : ignorée
		];
		expect(coteCombinee(lignes)).toBe(6);
	});

	it('arrondit à deux décimales', () => {
		const lignes = [ligne({ cote: 1.5 }), ligne({ cote: 1.5 })];
		expect(coteCombinee(lignes)).toBe(2.25);
	});

	it('null si une cote gardée manque', () => {
		expect(coteCombinee([ligne({ cote: 2 }), ligne({ cote: null })])).toBeNull();
	});

	it('null si une cote gardée est aberrante (≤ 1)', () => {
		expect(coteCombinee([ligne({ cote: 1 })])).toBeNull();
		expect(coteCombinee([ligne({ cote: 0.9 })])).toBeNull();
	});

	it('null si toutes les lignes sont retirées (aucune gardée)', () => {
		expect(coteCombinee([ligne({ cote: 2, retiree: true })])).toBeNull();
	});

	it('ignore une cote retirée manquante (seules les gardées comptent)', () => {
		const lignes = [ligne({ cote: 2, retiree: false }), ligne({ cote: null, retiree: true })];
		expect(coteCombinee(lignes)).toBe(2);
	});
});

describe('choisirExemples — déterministe, toujours au moins un échec', () => {
	const sauve = (id: number, cc: number) =>
		ticket({ id, bascule: 'sauve', coteCombinee: cc });
	const echec = (id: number, cc: number) =>
		ticket({ id, bascule: 'tombe_malgre', coteCombinee: cc });
	const passe = (id: number, cc: number) =>
		ticket({ id, bascule: 'passe_quand_meme', coteCombinee: cc });

	it('inclut un échec du jour quand il y en a un', () => {
		const duJour = [sauve(1, 4), sauve(2, 3), echec(3, 2)];
		const out = choisirExemples(duJour, duJour);
		expect(out.some((t) => t.bascule === 'tombe_malgre')).toBe(true);
	});

	it('puise l’échec dans le pool 7 jours quand le jour n’en a pas', () => {
		const duJour = [sauve(1, 4), sauve(2, 3)];
		const pool = [...duJour, echec(9, 2.5)];
		const out = choisirExemples(duJour, pool);
		expect(out.some((t) => t.id === 9 && t.bascule === 'tombe_malgre')).toBe(true);
	});

	it('reste sans échec seulement si aucun n’existe (jour ni pool)', () => {
		const duJour = [sauve(1, 4), sauve(2, 3)];
		const out = choisirExemples(duJour, duJour);
		expect(out.every((t) => t.bascule !== 'tombe_malgre')).toBe(true);
	});

	it('trie l’affichage par cote combinée décroissante', () => {
		const duJour = [sauve(1, 2), sauve(2, 8), echec(3, 5)];
		const out = choisirExemples(duJour, duJour);
		const cotes = out.map((t) => t.coteCombinee);
		const trie = [...cotes].sort((a, b) => (b ?? 0) - (a ?? 0));
		expect(cotes).toEqual(trie);
	});

	it('ne dépasse jamais NB_EXEMPLES', () => {
		const duJour = [
			echec(1, 2),
			sauve(2, 9),
			sauve(3, 8),
			sauve(4, 7),
			sauve(5, 6),
			passe(6, 3)
		];
		const out = choisirExemples(duJour, duJour);
		expect(out.length).toBeLessThanOrEqual(NB_EXEMPLES);
	});

	it('déterministe : même entrée → même sortie', () => {
		const duJour = [sauve(1, 4), echec(2, 6), sauve(3, 5), passe(4, 2)];
		const a = choisirExemples(duJour, duJour).map((t) => t.id);
		const b = choisirExemples(duJour, duJour).map((t) => t.id);
		expect(a).toEqual(b);
	});

	it('départage les cotes égales par id (stable)', () => {
		const duJour = [sauve(3, 5), sauve(1, 5), sauve(2, 5), echec(4, 2)];
		const ids = choisirExemples(duJour, duJour)
			.filter((t) => t.bascule === 'sauve')
			.map((t) => t.id);
		expect(ids).toEqual([1, 2, 3]);
	});
});

describe('libelleDate — anonyme et daté, jamais d’identifiant', () => {
	// Ancre : 2026-08-19 (mercredi) 15h00 UTC → 16h00 heure locale (UTC+1).
	const now = Date.parse('2026-08-19T15:00:00Z');

	it('aujourd’hui : juste l’heure locale', () => {
		const t = Date.parse('2026-08-19T08:40:00Z'); // 09h40 local
		expect(libelleDate(t, now, OFFSET)).toBe('9h40');
	});

	it('hier : « Hier, HHhMM »', () => {
		const t = Date.parse('2026-08-18T20:40:00Z'); // 21h40 local, la veille
		expect(libelleDate(t, now, OFFSET)).toBe('Hier, 21h40');
	});

	it('au-delà : « Jour date, HHhMM » avec majuscule', () => {
		const t = Date.parse('2026-08-16T20:05:00Z'); // dimanche 16, 21h05 local
		expect(libelleDate(t, now, OFFSET)).toBe('Dimanche 16, 21h05');
	});

	it('padde les minutes à deux chiffres', () => {
		const t = Date.parse('2026-08-19T08:05:00Z'); // 09h05 local
		expect(libelleDate(t, now, OFFSET)).toBe('9h05');
	});

	it('l’offset décide du jour local (soir tardif reste le même jour)', () => {
		const t = Date.parse('2026-08-19T22:30:00Z'); // 23h30 local, encore le 19
		expect(libelleDate(t, now, OFFSET)).toBe('23h30');
	});
});
