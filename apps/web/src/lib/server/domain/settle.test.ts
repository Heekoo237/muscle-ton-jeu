import { describe, it, expect } from 'vitest';
import {
	marketOutcome,
	settleMarket,
	settleReinforced,
	settleTicket,
	selectionOutcome,
	fixtureRetourne,
	fixtureFlipSuspect,
	orientationSensible,
	verdictAffiche,
	resultatIntrouvable,
	DELAI_RESULTAT_INTROUVABLE_JOURS,
	type FinalScore
} from './settle';
import type { Market, Selection } from '$lib/types';

describe('marketOutcome — marché × score final', () => {
	it('1X2 et double chance', () => {
		expect(marketOutcome('WIN_HOME', 2, 1)).toBe(true);
		expect(marketOutcome('DRAW', 1, 1)).toBe(true);
		expect(marketOutcome('WIN_AWAY', 0, 1)).toBe(true);
		expect(marketOutcome('DC_HOME_DRAW', 1, 1)).toBe(true);
		expect(marketOutcome('DC_HOME_DRAW', 0, 1)).toBe(false);
		expect(marketOutcome('DC_HOME_AWAY', 1, 1)).toBe(false);
	});
	it('plus/moins et les deux marquent', () => {
		expect(marketOutcome('OVER_2_5', 2, 1)).toBe(true);
		expect(marketOutcome('UNDER_2_5', 1, 1)).toBe(true);
		expect(marketOutcome('OVER_2_5', 1, 1)).toBe(false);
		expect(marketOutcome('BTTS_YES', 1, 1)).toBe(true);
		expect(marketOutcome('BTTS_NO', 2, 0)).toBe(true);
	});
});

describe('settleMarket — primitive unique (couvert → booléen, sinon null)', () => {
	it('règle les marchés couverts', () => {
		expect(settleMarket('WIN_HOME', 2, 0)).toBe(true);
		expect(settleMarket('DC_DRAW_AWAY', 0, 0)).toBe(true);
		expect(settleMarket('OVER_2_5', 2, 1)).toBe(true);
		expect(settleMarket('UNDER_3_5', 2, 1)).toBe(true);
		expect(settleMarket('BTTS_NO', 2, 0)).toBe(true);
		expect(settleMarket('BTTS_NO', 1, 1)).toBe(false);
	});
	it('renvoie null pour un marché non couvert ou nul', () => {
		expect(settleMarket('CORNERS_OVER_9_5', 5, 5)).toBeNull();
		expect(settleMarket(null, 1, 0)).toBeNull();
	});
});

function sel(ordre: number, marche: Market, fixtureId: number, retiree = false): Selection {
	return {
		ordre,
		texteBrut: `s${ordre}`,
		fixtureId,
		matchLabel: `M${ordre}`,
		marche,
		etatResolution: 'certain',
		coteSaisie: null,
		probabilite: 0.6,
		seuilFragile: 0.5,
		fragile: false,
		retireeDuRenforce: retiree,
		libelleFr: ''
	};
}

describe('settleReinforced — résultat du ticket renforcé', () => {
	const scores = (m: Record<number, FinalScore>) => new Map<number, FinalScore>(Object.entries(m).map(([k, v]) => [Number(k), v]));

	it('passe quand toutes les gardées sont terminées et gagnées', () => {
		const s = [sel(1, 'WIN_HOME', 10), sel(2, 'OVER_1_5', 11)];
		const r = settleReinforced(s, scores({ 10: { home: 2, away: 0 }, 11: { home: 1, away: 1 } }));
		expect(r.ticket).toBe('passe');
	});

	it('tombe dès qu’une sélection gardée est perdue', () => {
		const s = [sel(1, 'WIN_HOME', 10), sel(2, 'WIN_AWAY', 11)];
		const r = settleReinforced(s, scores({ 10: { home: 2, away: 0 }, 11: { home: 2, away: 0 } }));
		expect(r.ticket).toBe('tombe');
	});

	it('en attente tant qu’un match gardé n’est pas terminé', () => {
		const s = [sel(1, 'WIN_HOME', 10), sel(2, 'OVER_1_5', 11)];
		const r = settleReinforced(s, scores({ 10: { home: 2, away: 0 }, 11: null }));
		expect(r.ticket).toBe('en_attente');
	});

	it('ignore les sélections retirées du renforcé', () => {
		// La sélection retirée (2) est perdante, mais elle ne compte pas.
		const s = [sel(1, 'WIN_HOME', 10), sel(2, 'WIN_AWAY', 11, true)];
		const r = settleReinforced(s, scores({ 10: { home: 2, away: 0 }, 11: { home: 3, away: 0 } }));
		expect(r.ticket).toBe('passe');
		expect(r.parSelection.get(2)).toBe(false); // son issue reste calculée
	});
});

describe('settleTicket — verdicts original ET renforcé', () => {
	const scores = (m: Record<number, FinalScore>) =>
		new Map<number, FinalScore>(Object.entries(m).map(([k, v]) => [Number(k), v]));

	it('le renforcé sauve : original tombe (sélection retirée perdue), renforcé passe', () => {
		// 1 gardée gagnante, 2 RETIRÉE et perdante.
		const s = [sel(1, 'WIN_HOME', 10), sel(2, 'WIN_AWAY', 11, true)];
		const v = settleTicket(s, scores({ 10: { home: 2, away: 0 }, 11: { home: 3, away: 0 } }));
		expect(v.originale).toBe('tombe');
		expect(v.renforce).toBe('passe');
		expect(v.premierPerduOrdre).toBe(2);
	});

	it('les deux passent quand toutes les réglables gagnent', () => {
		const s = [sel(1, 'WIN_HOME', 10), sel(2, 'OVER_1_5', 11)];
		const v = settleTicket(s, scores({ 10: { home: 2, away: 0 }, 11: { home: 1, away: 1 } }));
		expect(v.originale).toBe('passe');
		expect(v.renforce).toBe('passe');
		expect(v.premierPerduOrdre).toBeNull();
	});

	it('en attente tant qu’un match réglable n’est pas terminé (les deux groupes)', () => {
		const s = [sel(1, 'WIN_HOME', 10), sel(2, 'OVER_1_5', 11)];
		const v = settleTicket(s, scores({ 10: { home: 2, away: 0 }, 11: null }));
		expect(v.originale).toBe('en_attente');
		expect(v.renforce).toBe('en_attente');
	});
});

describe('verdictAffiche — le verdict persisté prime sur le recalcul', () => {
	it('un verdict stocké (passe/tombe) prime toujours sur le recalcul', () => {
		expect(verdictAffiche('passe', 'en_attente')).toBe('passe');
		expect(verdictAffiche('tombe', 'en_attente')).toBe('tombe');
		// Ne rétrograde jamais un ticket réglé parce qu'un fetch de scores est vide.
		expect(verdictAffiche('passe', 'tombe')).toBe('passe');
	});

	it('sans verdict stocké, on retombe sur le recalcul (fenêtre ≤ 6 h avant le cron)', () => {
		expect(verdictAffiche(null, 'passe')).toBe('passe');
		expect(verdictAffiche(undefined, 'tombe')).toBe('tombe');
		expect(verdictAffiche(null, 'en_attente')).toBe('en_attente');
		// 'en_attente' stocké n'est pas une valeur posée par le cron : traité comme absent.
		expect(verdictAffiche('en_attente', 'passe')).toBe('passe');
	});
});

describe('resultatIntrouvable — un score qui ne viendra jamais', () => {
	const JOUR = 86_400_000;
	const now = 1_700_000_000_000;

	it('vrai quand le dernier match réglable est passé au-delà du délai', () => {
		const vieux = now - (DELAI_RESULTAT_INTROUVABLE_JOURS + 1) * JOUR;
		expect(resultatIntrouvable(vieux, now)).toBe(true);
	});

	it('faux tant qu’on est dans le délai (score encore possible)', () => {
		const recent = now - (DELAI_RESULTAT_INTROUVABLE_JOURS - 1) * JOUR;
		expect(resultatIntrouvable(recent, now)).toBe(false);
	});

	it('faux sans date de match connue', () => {
		expect(resultatIntrouvable(null, now)).toBe(false);
	});

	it('le délai dépasse la fenêtre /scores du fournisseur (3 j)', () => {
		expect(DELAI_RESULTAT_INTROUVABLE_JOURS).toBeGreaterThan(3);
	});
});

describe('snapshot d’orientation — un verdict ne se retourne jamais (cas Rennes–PSG)', () => {
	/** Sélection avec snapshot d’orientation : domicile = equipeDomId à l’analyse. */
	const selOr = (marche: Market, domId: number): Selection => ({
		...sel(1, marche, 10),
		equipeDomId: domId,
		equipeExtId: domId + 1
	});

	it('fixture INCHANGÉ (snapshot = orientation courante) : score lu tel quel', () => {
		// PSG (domicile à l’analyse, id 7) gagne 0-2 en tant que… non : domicile marque 0.
		const s = selOr('WIN_HOME', 7);
		const score: FinalScore = { home: 2, away: 0, homeTeamId: 7 };
		expect(fixtureRetourne(s, score)).toBe(false);
		expect(selectionOutcome(s, score)).toBe(true); // domicile gagne 2-0
	});

	it('fixture RETOURNÉ après l’analyse : on permute, le verdict tient', () => {
		// À l’analyse, domicile = équipe 7 (WIN_HOME misé sur 7). Le fixture est corrigé :
		// l’équipe 7 est désormais l’EXTÉRIEUR (team_home_id courant = 9). Le score courant
		// 0-2 est donc « 9 marque 0, 7 marque 2 ». Le pari WIN_HOME(7) DOIT gagner.
		const s = selOr('WIN_HOME', 7);
		const score: FinalScore = { home: 0, away: 2, homeTeamId: 9 };
		expect(fixtureRetourne(s, score)).toBe(true);
		expect(selectionOutcome(s, score)).toBe(true); // après permutation : 2-0 pour 7
	});

	it('sans snapshot (ancien ticket) : jamais de permutation, comportement historique', () => {
		const s = sel(1, 'WIN_HOME', 10); // pas d’equipeDomId
		const score: FinalScore = { home: 0, away: 2, homeTeamId: 9 };
		expect(fixtureRetourne(s, score)).toBe(false);
		expect(selectionOutcome(s, score)).toBe(false); // domicile perd 0-2, lu tel quel
	});

	it('orientation courante inconnue (score sans homeTeamId) : pas de permutation', () => {
		const s = selOr('WIN_HOME', 7);
		const score: FinalScore = { home: 2, away: 0 };
		expect(fixtureRetourne(s, score)).toBe(false);
		expect(selectionOutcome(s, score)).toBe(true);
	});

	it('un DRAW est insensible au retournement (symétrique)', () => {
		const s = selOr('DRAW', 7);
		expect(selectionOutcome(s, { home: 1, away: 1, homeTeamId: 9 })).toBe(true);
		expect(selectionOutcome(s, { home: 2, away: 1, homeTeamId: 9 })).toBe(false);
	});
});

describe('garde orientation — sélection SANS snapshot sur fixture retourné : retenue', () => {
	const scores = (m: Record<number, FinalScore>) =>
		new Map<number, FinalScore>(Object.entries(m).map(([k, v]) => [Number(k), v]));

	it('fixtureFlipSuspect : écart énorme DC modèle vs 1X2 coté', () => {
		expect(fixtureFlipSuspect(0.864, 0.17, 0.2)).toBe(true); // écart 0,49
		expect(fixtureFlipSuspect(0.37, 0.16, 0.2)).toBe(false); // cohérent
		expect(fixtureFlipSuspect(null, 0.16, 0.2)).toBe(false); // DC non-modèle → null
	});

	it('orientationSensible : 1X2/DC oui, nul et symétriques non', () => {
		expect(orientationSensible('WIN_HOME')).toBe(true);
		expect(orientationSensible('DC_DRAW_AWAY')).toBe(true);
		expect(orientationSensible('DRAW')).toBe(false);
		expect(orientationSensible('OVER_2_5')).toBe(false);
		expect(orientationSensible('BTTS_YES')).toBe(false);
	});

	it('sélection SANS snapshot sur fixture flip-suspect → RETENUE, ticket en attente', () => {
		const s = [sel(1, 'WIN_HOME', 10)]; // pas d'equipeDomId
		const v = settleTicket(s, scores({ 10: { home: 2, away: 0, homeTeamId: 9 } }), new Set([10]));
		expect(v.retenues).toEqual([1]);
		expect(v.parSelection.get(1)).toBeNull(); // non réglée
		expect(v.originale).toBe('en_attente'); // jamais un faux verdict
	});

	it('sélection AVEC snapshot : jamais retenue, réglée normalement (permutation)', () => {
		const s: Selection[] = [{ ...sel(1, 'WIN_HOME', 10), equipeDomId: 7, equipeExtId: 8 }];
		const v = settleTicket(s, scores({ 10: { home: 0, away: 2, homeTeamId: 9 } }), new Set([10]));
		expect(v.retenues).toEqual([]);
		expect(v.parSelection.get(1)).toBe(true); // 7 gagne après permutation
	});

	it('marché symétrique sans snapshot sur fixture flip-suspect : PAS retenu (nul)', () => {
		const s = [sel(1, 'DRAW', 10)];
		const v = settleTicket(s, scores({ 10: { home: 1, away: 1, homeTeamId: 9 } }), new Set([10]));
		expect(v.retenues).toEqual([]);
		expect(v.parSelection.get(1)).toBe(true);
	});

	it('sans set de flip-suspects : comportement historique, rien retenu', () => {
		const s = [sel(1, 'WIN_HOME', 10)];
		const v = settleTicket(s, scores({ 10: { home: 2, away: 0, homeTeamId: 9 } }));
		expect(v.retenues).toEqual([]);
		expect(v.parSelection.get(1)).toBe(true);
	});
});
