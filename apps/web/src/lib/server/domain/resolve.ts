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
import type { RawTicketRead } from '$lib/server/services/vision';
import { resolveMarket, marketLabelFr } from './market-map';

function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Retrouve une équipe par nom ou alias (contient l'un dans l'autre). */
function matchTeam(name: string, teams: Team[]): Team | null {
	const n = normalize(name);
	if (!n) return null;
	let best: Team | null = null;
	for (const t of teams) {
		const candidates = [t.nom, ...t.aliases].map(normalize);
		if (candidates.some((c) => c === n || n.includes(c) || c.includes(n))) {
			// Préfère la correspondance la plus « exacte » (nom complet).
			if (!best || normalize(t.nom) === n) best = t;
		}
	}
	return best;
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
): { fixture: Fixture; home: string; away: string } | null {
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
	return { fixture, home: home.nom, away: away.nom };
}

/**
 * Transforme la lecture brute en sélections résolues, prêtes pour l'écran de
 * validation. L'index d'appariement (`ordre`) est attribué une fois, ici.
 */
export function resolveTicket(raw: RawTicketRead, fixtures: Fixture[], teams: Team[]): Selection[] {
	return raw.lignes.map((ligne, i): Selection => {
		const ordre = i + 1;
		const { matchText, marketText, odds } = splitLine(ligne.texteBrut);
		const fx = matchFixture(matchText, fixtures, teams);
		const market = resolveMarket(marketText);

		// Match non reconnu → ligne inconnue quel que soit le marché.
		if (!fx) {
			return {
				ordre,
				texteBrut: ligne.texteBrut,
				matchLabel: matchText || ligne.texteBrut,
				fixtureId: null,
				marche: null,
				etatResolution: 'inconnu',
				raison: 'inconnu',
				coteSaisie: odds,
				probabilite: null,
				seuilFragile: null,
				fragile: false,
				retireeDuRenforce: false,
				libelleFr: ''
			};
		}

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

		// Marché non couvert ou inconnu, mais match reconnu.
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
