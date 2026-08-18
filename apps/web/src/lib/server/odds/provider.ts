/**
 * provider.ts — Client The Odds API pour la récupération À LA DEMANDE (app TS).
 *
 * Mêmes règles de sélection de book que le collecteur Python (`provider.py`) pour que
 * la valeur à la demande coïncide avec ce que le collecteur écrira ensuite :
 *  - 1X2 (h2h) : book de RÉFÉRENCE (Pinnacle prioritaire, sinon premier book CLASSIQUE) ;
 *  - plus/moins à un point donné : le book non-exchange le plus SERRÉ qui poste ce point ;
 *  - JAMAIS un exchange (carnet mince → cotes aberrantes, dévigage calibré sur des books
 *    classiques).
 *
 * Le PARSING est pur (testable sans réseau). Les appels réseau sont fins, bornés par
 * un AbortController (budget < 2 s), et ne lèvent jamais vers l'appelant sans filet.
 */
import { env } from '$env/dynamic/private';
import type { Market } from '$lib/types';

const BASE = 'https://api.the-odds-api.com/v4';
const REGION = 'eu';
const BOOKMAKER = 'pinnacle';
const EXCHANGE_MARKERS = ['betfair_ex', 'matchbook', 'smarkets', 'betdaq'];

export interface EvenementCotes {
	eventId: string;
	home: string;
	away: string;
	commenceIso: string | null;
	/** Cotes dé-vigeables par marché interne (décimales). */
	cotes: Partial<Record<Market, number>>;
}

export type OddsApiOutcome = { name?: string; price?: number; point?: number };
export type OddsApiMarket = { key?: string; outcomes?: OddsApiOutcome[] };
export type OddsApiBook = { key?: string; markets?: OddsApiMarket[] };
export type OddsApiEvent = {
	id?: string;
	home_team?: string;
	away_team?: string;
	commence_time?: string;
	bookmakers?: OddsApiBook[];
};

const isExchange = (key: string | undefined) =>
	EXCHANGE_MARKERS.some((m) => (key ?? '').toLowerCase().includes(m));

const marketOf = (b: OddsApiBook, key: string): OddsApiMarket | undefined =>
	(b.markets ?? []).find((m) => m.key === key);

/** Book de référence pour un marché : Pinnacle s'il poste ce marché, sinon premier book classique. */
function pickRefBook(books: OddsApiBook[], marketKey: string): OddsApiBook | undefined {
	const pin = books.find((b) => b.key === BOOKMAKER && marketOf(b, marketKey));
	if (pin) return pin;
	return books.find((b) => !isExchange(b.key) && marketOf(b, marketKey));
}

/** 1X2 depuis le book de référence h2h. */
function extractH2H(books: OddsApiBook[], home: string, away: string): Partial<Record<Market, number>> {
	const out: Partial<Record<Market, number>> = {};
	const b = pickRefBook(books, 'h2h');
	for (const oc of marketOf(b ?? {}, 'h2h')?.outcomes ?? []) {
		const p = typeof oc.price === 'number' ? oc.price : NaN;
		if (!(p > 1)) continue;
		if (oc.name === home) out.WIN_HOME = p;
		else if (oc.name === away) out.WIN_AWAY = p;
		else if (oc.name === 'Draw') out.DRAW = p;
	}
	return out;
}

/** (Over, Under) à un point donné chez un book, ou null. Cherche dans `totals` ET
 *  `alternate_totals`, et balaie TOUS les marchés portant ces clés (un book peut en
 *  lister plusieurs, un par point) — pas seulement le premier. */
function totalsPair(b: OddsApiBook, point: number): [number, number] | null {
	let over: number | undefined;
	let under: number | undefined;
	for (const m of b.markets ?? []) {
		if (m.key !== 'totals' && m.key !== 'alternate_totals') continue;
		for (const oc of m.outcomes ?? []) {
			if (oc.point !== point) continue;
			if (oc.name === 'Over') over = oc.price;
			else if (oc.name === 'Under') under = oc.price;
		}
	}
	return typeof over === 'number' && typeof under === 'number' && over > 1 && under > 1
		? [over, under]
		: null;
}

const POINT_MARKETS: Record<number, [Market, Market]> = {
	1.5: ['OVER_1_5', 'UNDER_1_5'],
	2.5: ['OVER_2_5', 'UNDER_2_5'],
	3.5: ['OVER_3_5', 'UNDER_3_5']
};

/** Plus/moins à `point` chez le book non-exchange le plus SERRÉ (Pinnacle prioritaire s'il l'a). */
function extractTotals(books: OddsApiBook[], point: number): Partial<Record<Market, number>> {
	const out: Partial<Record<Market, number>> = {};
	const marches = POINT_MARKETS[point];
	if (!marches) return out;
	let best: [number, number] | null = null;
	let bestMargin = Infinity;
	const pin = books.find((b) => b.key === BOOKMAKER);
	const pinPair = pin && !isExchange(pin.key) ? totalsPair(pin, point) : null;
	if (pinPair) {
		best = pinPair; // Pinnacle prioritaire quand il a la ligne
	} else {
		for (const b of books) {
			if (isExchange(b.key)) continue;
			const pair = totalsPair(b, point);
			if (!pair) continue;
			const margin = 1 / pair[0] + 1 / pair[1];
			if (margin < bestMargin) {
				bestMargin = margin;
				best = pair;
			}
		}
	}
	if (best) {
		out[marches[0]] = best[0];
		out[marches[1]] = best[1];
	}
	return out;
}

/** BTTS depuis le book de référence btts. */
function extractBTTS(books: OddsApiBook[]): Partial<Record<Market, number>> {
	const out: Partial<Record<Market, number>> = {};
	const b = pickRefBook(books, 'btts');
	for (const oc of marketOf(b ?? {}, 'btts')?.outcomes ?? []) {
		const p = typeof oc.price === 'number' ? oc.price : NaN;
		if (!(p > 1)) continue;
		if (oc.name === 'Yes') out.BTTS_YES = p;
		else if (oc.name === 'No') out.BTTS_NO = p;
	}
	return out;
}

/** Parse PUR d'un événement The Odds API → cotes internes, selon les marchés demandés. */
export function parseEvent(
	ev: OddsApiEvent,
	opts: { h2h?: boolean; totalsPoints?: number[]; btts?: boolean }
): EvenementCotes | null {
	const home = ev.home_team;
	const away = ev.away_team;
	const id = ev.id;
	if (!home || !away || !id) return null;
	const books = ev.bookmakers ?? [];
	const cotes: Partial<Record<Market, number>> = {};
	if (opts.h2h) Object.assign(cotes, extractH2H(books, home, away));
	for (const pt of opts.totalsPoints ?? []) Object.assign(cotes, extractTotals(books, pt));
	if (opts.btts) Object.assign(cotes, extractBTTS(books));
	return { eventId: id, home, away, commenceIso: ev.commence_time ?? null, cotes };
}

/** True si le client peut appeler le fournisseur (clé configurée). */
export function providerConfigured(): boolean {
	return Boolean(env.MTJ_PROVIDER_KEY);
}

/** Réponse brute + crédits consommés (en-tête `x-requests-last`) pour le journal. */
async function getJson(url: string, timeoutMs: number): Promise<{ data: unknown; credits: number }> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const r = await fetch(url, { signal: ctrl.signal });
		if (!r.ok) throw new Error(`the-odds-api ${r.status}`);
		const credits = Number(r.headers.get('x-requests-last') ?? 0) || 0;
		return { data: await r.json(), credits };
	} finally {
		clearTimeout(t);
	}
}

/** Résultat d'un appel : les cotes parsées + les crédits fournisseur consommés. */
export interface ResultatLigue {
	evenements: EvenementCotes[];
	credits: number;
}
export interface ResultatEvenement {
	evenement: EvenementCotes | null;
	credits: number;
}

/** Cotes de TOUS les matchs d'une ligue (endpoint par ligue, h2h + plus/moins 2,5). 2 crédits. */
export async function fetchLeagueOdds(sportKey: string, timeoutMs: number): Promise<ResultatLigue> {
	const key = env.MTJ_PROVIDER_KEY;
	if (!key) return { evenements: [], credits: 0 };
	const url = `${BASE}/sports/${sportKey}/odds?apiKey=${key}&regions=${REGION}&markets=h2h,totals&oddsFormat=decimal`;
	const { data, credits } = await getJson(url, timeoutMs);
	const evenements = (Array.isArray(data) ? (data as OddsApiEvent[]) : [])
		.map((ev) => parseEvent(ev, { h2h: true, totalsPoints: [2.5] }))
		.filter((x): x is EvenementCotes => x !== null);
	return { evenements, credits };
}

/** Marchés additionnels d'UN match (endpoint par événement : plus/moins 1,5/3,5 + BTTS). ~2-3 crédits. */
export async function fetchEventExtras(
	sportKey: string,
	eventId: string,
	timeoutMs: number
): Promise<ResultatEvenement> {
	const key = env.MTJ_PROVIDER_KEY;
	if (!key) return { evenement: null, credits: 0 };
	const url = `${BASE}/sports/${sportKey}/events/${eventId}/odds?apiKey=${key}&regions=${REGION}&markets=alternate_totals,btts&oddsFormat=decimal`;
	const { data, credits } = await getJson(url, timeoutMs);
	return { evenement: parseEvent(data as OddsApiEvent, { totalsPoints: [1.5, 3.5], btts: true }), credits };
}
