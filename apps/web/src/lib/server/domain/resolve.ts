/**
 * resolve.ts — Résolution des matchs et des marchés (brief §5.2, chemin temps réel).
 *
 * Le LLM vision a extrait du texte brut. Ici, du CODE :
 *  - résout le match par fuzzy matching sur les noms + alias, restreint aux
 *    fixtures des 7 prochains jours ;
 *  - résout le marché via la table stricte (états certain / ambigu / inconnu) ;
 *  - ne devine JAMAIS. Un doute = ambigu (choix proposé) ; un inconnu = inconnu.
 *
 * Aucune probabilité n'est calculée ni lue ici.
 */
import type { Fixture, Selection, Team } from '$lib/types';
import type { RawLine, RawTicketRead } from '$lib/server/services/vision';
import { resolveMarket, marketLabelFr, splitResultMarket, type MarketResolution } from './market-map';

function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Vrai si `needle` apparaît dans `hay` comme une suite de MOTS ENTIERS. */
function wordPhraseIn(needle: string, hay: string): boolean {
	return ` ${hay} `.includes(` ${needle} `);
}

/**
 * Retrouve l'équipe désignée par un nom de ticket. Garde-fou anti-fusion, version
 * résolution : deux clubs distincts ne se confondent JAMAIS. On préfère l'exact ;
 * à défaut, on tolère la contenance par mots entiers mais SEULEMENT si elle
 * désigne une seule équipe. Deux clubs qui matchent (« Paris » avec « Paris FC »
 * ET « Paris SG ») → on rend `null` : le nom reste INCONNU, jamais deviné.
 *
 * L'ancienne contenance par sous-chaîne (`n.includes(c)`) collait un club sur un
 * autre dès qu'un nom en contenait un autre — sans danger à 11 ligues, mais la
 * couverture élargie multiplie les clubs d'une même ville. On l'a retirée.
 */
function matchTeam(name: string, teams: Team[]): Team | null {
	const n = normalize(name);
	if (!n) return null;
	// 1) Exact (nom ou alias identique). Un seul club → certain ; plusieurs → ambigu.
	const exact = teams.filter((t) => [t.nom, ...t.aliases].map(normalize).some((c) => c === n));
	if (exact.length === 1) return exact[0];
	if (exact.length > 1) return null;
	// 2) Contenance par mots entiers, dans un sens ou l'autre, mais UNIQUE.
	const near = teams.filter((t) =>
		[t.nom, ...t.aliases].map(normalize).some((c) => wordPhraseIn(c, n) || wordPhraseIn(n, c))
	);
	return near.length === 1 ? near[0] : null;
}

/** Découpe une ligne brute « Match  Marché  Cote » sur les espaces multiples. */
function splitLine(texteBrut: string): { matchText: string; marketText: string; odds: number | null } {
	const parts = texteBrut.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
	let odds: number | null = null;
	let rest = parts;
	const last = parts[parts.length - 1];
	if (last && /^\d+([.,]\d+)?$/.test(last)) {
		odds = Number(last.replace(',', '.'));
		rest = parts.slice(0, -1);
	}
	const marketText = rest.length >= 2 ? rest[rest.length - 1] : '';
	const matchText = rest.length >= 2 ? rest.slice(0, -1).join(' ') : rest.join(' ');
	return { matchText, marketText, odds };
}

/** Trouve la fixture correspondant au texte « TeamA - TeamB », dans la fenêtre 7 j. */
function matchFixture(
	matchText: string,
	fixtures: Fixture[],
	teams: Team[]
): { fixture: Fixture; home: string; away: string; homeTeam: Team; awayTeam: Team } | null {
	const sides = matchText.split(/\s+[-–]\s+/); // « - » ou « – »
	if (sides.length < 2) return null;
	const home = matchTeam(sides[0], teams);
	const away = matchTeam(sides[1], teams);
	if (!home || !away) return null;
	const fixture = fixtures.find(
		(f) =>
			normalize(f.teamHome) === normalize(home.nom) &&
			normalize(f.teamAway) === normalize(away.nom)
	);
	if (!fixture) return null;
	return { fixture, home: home.nom, away: away.nom, homeTeam: home, awayTeam: away };
}

/** Le texte ressemble-t-il à un vrai match « A - B » (deux côtés lisibles) ? */
function looksLikeMatch(matchText: string): boolean {
	return matchText.split(/\s+[-–]\s+/).filter((s) => s.trim().length >= 2).length >= 2;
}

const DRAW_WORDS = new Set(['nul', 'match nul', 'draw', 'x', 'egalite']);

/** À quel camp du match correspond ce choix ? (mêmes alias que les noms d'équipe) */
function whichSide(choice: string, home: Team, away: Team): 'home' | 'away' | null {
	const t = matchTeam(choice, [home, away]);
	if (!t) return null;
	return normalize(t.nom) === normalize(home.nom) ? 'home' : 'away';
}

/**
 * Résout le marché AVEC le contexte du match : gère les libellés « CHOIX + TYPE »
 * (« Paris SG Résultat du match » → issue à comparer aux équipes). Le CHOIX est
 * résolu contre les vraies équipes ; s'il ne correspond à aucune ni à « Nul »,
 * on reste INCONNU (jamais deviné). Sinon, table stricte habituelle.
 */
function resolveMarketForFixture(
	marketText: string,
	home: Team,
	away: Team
): MarketResolution {
	const split = splitResultMarket(marketText);
	if (split) {
		const c = normalize(split.choice);
		if (split.kind === '1x2') {
			if (!c) return { state: 'inconnu', market: null, raison: 'inconnu' };
			if (DRAW_WORDS.has(c)) return { state: 'certain', market: 'DRAW' };
			const side = whichSide(split.choice, home, away);
			if (side === 'home') return { state: 'certain', market: 'WIN_HOME' };
			if (side === 'away') return { state: 'certain', market: 'WIN_AWAY' };
			return { state: 'inconnu', market: null, raison: 'inconnu' }; // choix non reconnu
		}
		if (split.kind === 'btts') {
			return /\bnon\b|\bno\b/.test(c)
				? { state: 'certain', market: 'BTTS_NO' }
				: { state: 'certain', market: 'BTTS_YES' };
		}
		// Double chance : deux issues parmi domicile / nul / extérieur.
		const parts = c.split(/\s+ou\s+|\s+or\s+|\//).map((s) => s.trim()).filter(Boolean);
		const sides = new Set<string>();
		for (const p of parts) {
			if (DRAW_WORDS.has(p)) sides.add('draw');
			else {
				const s = whichSide(p, home, away);
				if (s) sides.add(s);
			}
		}
		if (sides.has('home') && sides.has('draw')) return { state: 'certain', market: 'DC_HOME_DRAW' };
		if (sides.has('away') && sides.has('draw')) return { state: 'certain', market: 'DC_DRAW_AWAY' };
		if (sides.has('home') && sides.has('away')) return { state: 'certain', market: 'DC_HOME_AWAY' };
		return { state: 'inconnu', market: null, raison: 'inconnu' };
	}
	return resolveMarket(marketText);
}

/** Champs d'une ligne : structurés si le modèle vision les a isolés, sinon découpés. */
function lineParts(ligne: RawLine): { matchText: string; marketText: string; odds: number | null } {
	if (ligne.matchText || ligne.marketText || ligne.coteText) {
		const c = (ligne.coteText ?? '').replace(',', '.').trim();
		const odds = /^\d+(\.\d+)?$/.test(c) ? Number(c) : null;
		return { matchText: ligne.matchText ?? '', marketText: ligne.marketText ?? '', odds };
	}
	return splitLine(ligne.texteBrut);
}

/**
 * Transforme la lecture brute en sélections résolues, prêtes pour l'écran de
 * validation. L'index d'appariement (`ordre`) est attribué une fois, ici.
 */
export function resolveTicket(raw: RawTicketRead, fixtures: Fixture[], teams: Team[]): Selection[] {
	return raw.lignes.map((ligne, i): Selection => {
		const ordre = i + 1;
		const { matchText, marketText, odds } = lineParts(ligne);
		const fx = matchFixture(matchText, fixtures, teams);

		// Match non reconnu. On distingue DEUX causes :
		//  - le texte ressemble à un vrai match « A - B » mais les équipes ne sont
		//    pas dans nos championnats couverts → HORS COUVERTURE (gardé, non
		//    analysé, non facturé, RIEN à corriger) ;
		//  - le texte n'est pas lisible comme un match → INCONNU (à corriger).
		if (!fx) {
			const raison = looksLikeMatch(matchText) ? 'hors_couverture' : 'inconnu';
			if (raison === 'hors_couverture') {
				console.warn(`[résolution] championnat NON COUVERT : « ${matchText} »`);
			}
			return {
				ordre,
				texteBrut: ligne.texteBrut,
				matchLabel: matchText || ligne.texteBrut,
				fixtureId: null,
				marche: null,
				etatResolution: 'inconnu',
				raison,
				coteSaisie: odds,
				probabilite: null,
				seuilFragile: null,
				fragile: false,
				retireeDuRenforce: false,
				libelleFr: ''
			};
		}

		const market = resolveMarketForFixture(marketText, fx.homeTeam, fx.awayTeam);

		const matchLabel = `${fx.home} – ${fx.away}`;

		if (market.state === 'certain' && market.market) {
			return {
				ordre,
				texteBrut: ligne.texteBrut,
				matchLabel,
				fixtureId: fx.fixture.id,
				marche: market.market,
				etatResolution: 'certain',
				coteSaisie: odds,
				probabilite: null, // lue plus tard dans predictions
				seuilFragile: null,
				fragile: false,
				retireeDuRenforce: false,
				libelleFr: marketLabelFr(market.market, fx.home, fx.away)
			};
		}

		if (market.state === 'ambigu') {
			return {
				ordre,
				texteBrut: ligne.texteBrut,
				matchLabel,
				fixtureId: fx.fixture.id,
				marche: null,
				etatResolution: 'ambigu',
				raison: 'ambigu',
				candidates: market.candidates,
				coteSaisie: odds,
				probabilite: null,
				seuilFragile: null,
				fragile: false,
				retireeDuRenforce: false,
				libelleFr: ''
			};
		}

		// Marché non couvert ou inconnu, mais match reconnu. On JOURNALISE la
		// notation demandée : c'est elle qui nous dira quels marchés (ou quelles
		// notations de bookmaker) ajouter en priorité à la table.
		const quoi = marketText || ligne.texteBrut;
		if (market.raison === 'non_couvert') {
			console.warn(`[résolution] marché NON COUVERT demandé : « ${quoi} »`);
		} else {
			console.warn(`[résolution] notation NON RECONNUE : « ${quoi} »`);
		}
		return {
			ordre,
			texteBrut: ligne.texteBrut,
			matchLabel,
			fixtureId: fx.fixture.id,
			marche: null,
			etatResolution: 'inconnu',
			raison: market.raison ?? 'inconnu',
			coteSaisie: odds,
			probabilite: null,
			seuilFragile: null,
			fragile: false,
			retireeDuRenforce: false,
			libelleFr: ''
		};
	});
}
