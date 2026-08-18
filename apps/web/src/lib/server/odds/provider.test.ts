import { describe, it, expect } from 'vitest';
import { parseEvent, type OddsApiBook } from './provider';

/**
 * Parse PUR (sans réseau) d'un événement The Odds API, avec les MÊMES règles de
 * sélection de book que le collecteur Python (`provider.py`) :
 *  - 1X2 / BTTS : book de RÉFÉRENCE (Pinnacle prioritaire) ;
 *  - plus/moins : book non-exchange le plus SERRÉ qui poste le point ;
 *  - un EXCHANGE (betfair_ex, matchbook…) est toujours rejeté.
 */
function ev(bookmakers: OddsApiBook[]) {
	return {
		id: 'evt_1',
		home_team: 'Arsenal',
		away_team: 'Liverpool',
		commence_time: '2026-08-20T18:45:00Z',
		bookmakers
	};
}
const h2h = (home: number, draw: number, away: number) => ({
	key: 'h2h',
	outcomes: [
		{ name: 'Arsenal', price: home },
		{ name: 'Liverpool', price: away },
		{ name: 'Draw', price: draw }
	]
});
const totals = (point: number, over: number, under: number, key = 'totals') => ({
	key,
	outcomes: [
		{ name: 'Over', price: over, point },
		{ name: 'Under', price: under, point }
	]
});

describe('parseEvent — mapping des marchés', () => {
	it('mappe 1X2 par NOM d’équipe (jamais par ordre d’affichage)', () => {
		const out = parseEvent(ev([{ key: 'pinnacle', markets: [h2h(2.1, 3.4, 3.6)] }]), { h2h: true })!;
		expect(out.cotes.WIN_HOME).toBe(2.1);
		expect(out.cotes.DRAW).toBe(3.4);
		expect(out.cotes.WIN_AWAY).toBe(3.6);
		expect(out.eventId).toBe('evt_1');
	});

	it('1X2 : Pinnacle prioritaire même si un autre book est présent', () => {
		const out = parseEvent(
			ev([
				{ key: 'williamhill', markets: [h2h(2.0, 3.3, 3.9)] },
				{ key: 'pinnacle', markets: [h2h(2.1, 3.4, 3.6)] }
			]),
			{ h2h: true }
		)!;
		expect(out.cotes.WIN_HOME).toBe(2.1); // Pinnacle, pas William Hill
	});

	it('1X2 : sans Pinnacle, prend le premier book CLASSIQUE (jamais l’exchange)', () => {
		const out = parseEvent(
			ev([
				{ key: 'betfair_ex', markets: [h2h(2.5, 3.0, 3.0)] },
				{ key: 'unibet', markets: [h2h(2.05, 3.5, 3.7)] }
			]),
			{ h2h: true }
		)!;
		expect(out.cotes.WIN_HOME).toBe(2.05); // Unibet, l'exchange est ignoré
	});

	it('plus/moins 2,5 : book non-exchange le plus SERRÉ quand Pinnacle absent', () => {
		const out = parseEvent(
			ev([
				{ key: 'bookA', markets: [totals(2.5, 1.8, 1.9)] }, // marge 1/1.8+1/1.9 = 1.081
				{ key: 'bookB', markets: [totals(2.5, 1.95, 1.95)] } // marge 1.025 → plus serré
			]),
			{ totalsPoints: [2.5] }
		)!;
		expect(out.cotes.OVER_2_5).toBe(1.95);
		expect(out.cotes.UNDER_2_5).toBe(1.95);
	});

	it('plus/moins : Pinnacle prioritaire s’il poste la ligne (même si moins serré)', () => {
		const out = parseEvent(
			ev([
				{ key: 'pinnacle', markets: [totals(2.5, 1.9, 1.98)] },
				{ key: 'bookB', markets: [totals(2.5, 1.97, 1.97)] } // plus serré, mais pas Pinnacle
			]),
			{ totalsPoints: [2.5] }
		)!;
		expect(out.cotes.OVER_2_5).toBe(1.9); // Pinnacle
	});

	it('plus/moins : un exchange serré est REFUSÉ, on prend le book classique', () => {
		const out = parseEvent(
			ev([
				{ key: 'matchbook', markets: [totals(2.5, 2.0, 2.0)] }, // marge 1.0 (exchange) → refusé
				{ key: 'bookB', markets: [totals(2.5, 1.9, 1.95)] }
			]),
			{ totalsPoints: [2.5] }
		)!;
		expect(out.cotes.OVER_2_5).toBe(1.9);
	});

	it('marchés additionnels : alternate_totals (1,5 / 3,5) + BTTS', () => {
		const out = parseEvent(
			ev([
				{
					key: 'pinnacle',
					markets: [
						totals(1.5, 1.28, 3.8, 'alternate_totals'),
						totals(3.5, 2.65, 1.5, 'alternate_totals'),
						{ key: 'btts', outcomes: [{ name: 'Yes', price: 1.72 }, { name: 'No', price: 2.1 }] }
					]
				}
			]),
			{ totalsPoints: [1.5, 3.5], btts: true }
		)!;
		expect(out.cotes.OVER_1_5).toBe(1.28);
		expect(out.cotes.OVER_3_5).toBe(2.65);
		expect(out.cotes.BTTS_YES).toBe(1.72);
		expect(out.cotes.BTTS_NO).toBe(2.1);
	});

	it('événement incomplet (équipe ou id manquant) → null', () => {
		expect(parseEvent({ home_team: 'A', bookmakers: [] }, { h2h: true })).toBeNull();
		expect(parseEvent({ id: 'x', home_team: 'A', bookmakers: [] }, { h2h: true })).toBeNull();
	});

	it('cote aberrante (≤ 1) ignorée, jamais dévigée en aval', () => {
		const out = parseEvent(ev([{ key: 'pinnacle', markets: [h2h(1.0, 3.4, 3.6)] }]), { h2h: true })!;
		expect(out.cotes.WIN_HOME).toBeUndefined(); // 1.0 rejetée
		expect(out.cotes.DRAW).toBe(3.4);
	});
});
