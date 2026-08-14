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
import { aliasFor } from './team-aliases';
import { ANALYSIS_WINDOW_DAYS } from './window';

function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // accents
		.replace(/[^a-z0-9 ]/g, ' ') // ponctuation → espace (aligne avec le pipeline Python)
		.replace(/\s+/g, ' ')
		.trim();
}

/** Mots « significatifs » d'un nom (≥ 4 lettres) — sert au diagnostic des candidats. */
function significantTokens(n: string): string[] {
	return n.split(' ').filter((t) => t.length >= 4);
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
/** Identifiant de club d'une entité (son clubId, ou son id si non réconcilié). */
function clubOf(t: Team): number {
	return t.clubId ?? t.id;
}

function matchTeam(name: string, teams: Team[]): Team | null {
	const raw = normalize(name);
	if (!raw) return null;
	// La capture parle bookmaker, la base parle Odds API : on cherche AUSSI sous le
	// nom de référence si la carte curée en connaît un (« paris sg » → « paris saint
	// germain »). Plusieurs ENTITÉS d'un MÊME club (« Clermont » L1 + L2) ne sont
	// PAS ambiguës — elles partagent un clubId. Seuls des CLUBS distincts le sont.
	const n = aliasFor(raw);
	const exact = teams.filter((t) => [t.nom, ...t.aliases].map(normalize).some((c) => c === n));
	if (exact.length >= 1) {
		return new Set(exact.map(clubOf)).size === 1 ? exact[0] : null;
	}
	// Contenance par mots entiers, dans un sens ou l'autre, mais un seul CLUB.
	const near = teams.filter((t) =>
		[t.nom, ...t.aliases].map(normalize).some((c) => wordPhraseIn(c, n) || wordPhraseIn(n, c))
	);
	return near.length >= 1 && new Set(near.map(clubOf)).size === 1 ? near[0] : null;
}

/** Équipes en base partageant un mot significatif avec `name` (candidats probables
 *  d'un alias manquant). Sert UNIQUEMENT au diagnostic — jamais à résoudre. */
function candidatesFor(name: string, teams: Team[]): Team[] {
	const toks = new Set(significantTokens(aliasFor(normalize(name))));
	if (!toks.size) return [];
	return teams
		.filter((t) =>
			[t.nom, ...t.aliases].some((c) => significantTokens(normalize(c)).some((tk) => toks.has(tk)))
		)
		.slice(0, 6);
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

/**
 * Diagnostic de match — sépare les causes qu'on confondait toutes en « non
 * couvert ». Un match non résolu peut vouloir dire quatre choses DIFFÉRENTES :
 *  - `ok`             : les deux équipes ET un match dans les 7 jours ;
 *  - `hors_fenetre`   : les deux équipes reconnues, mais aucun match sous 7 jours ;
 *  - `non_resolu`     : au moins un nom non reconnu MAIS un candidat existe en base
 *                       (alias manquant — c'est NOTRE lacune, pas une non-couverture) ;
 *  - `hors_couverture`: aucun candidat en base pour un côté (championnat absent) ;
 *  - `illisible`      : le texte n'est pas un « A - B » lisible.
 * Chaque cas non-ok est JOURNALISÉ avec le nom lu, la clé, et les candidats.
 */
type MatchDiag =
	| { kind: 'ok'; fixture: Fixture; homeTeam: Team; awayTeam: Team }
	| { kind: 'hors_fenetre'; homeTeam: Team; awayTeam: Team }
	| { kind: 'non_resolu' }
	| { kind: 'hors_couverture' }
	| { kind: 'illisible' };

function diagnoseMatch(
	matchText: string,
	fixtures: Fixture[],
	teams: Team[],
	clubByName: Map<string, number>
): MatchDiag {
	const sides = matchText.split(/\s+[-–]\s+/).map((s) => s.trim());
	if (sides.filter((s) => s.length >= 2).length < 2) return { kind: 'illisible' };
	const [rawHome, rawAway] = sides;
	const homeTeam = matchTeam(rawHome, teams);
	const awayTeam = matchTeam(rawAway, teams);

	if (homeTeam && awayTeam) {
		// On cherche par CLUB, pas par entité : le match de ce soir peut être rattaché
		// à « Stade de Reims » [L2] alors que le ticket a résolu « Reims » [L1] — même
		// club, club_id commun. Sans réconciliation, clubOf = id propre → comportement
		// d'avant (on ne casse rien tant que club_id n'est pas rempli).
		const homeClub = clubOf(homeTeam);
		const awayClub = clubOf(awayTeam);
		const fixture = fixtures.find(
			(f) =>
				clubByName.get(normalize(f.teamHome)) === homeClub &&
				clubByName.get(normalize(f.teamAway)) === awayClub
		);
		// « Hors fenêtre » N'EST vrai que si un match existe RÉELLEMENT entre ces deux
		// équipes, à une date au-delà de la période analysée. Sinon (aucun match entre
		// elles), c'est « on n'a pas retrouvé ce match » — pas « hors fenêtre ». Ce
		// libellé m'avait induit en erreur ; il colle maintenant à la donnée.
		if (fixture) {
			const t = Date.parse(fixture.dateUtc);
			const horizon = Date.now() + ANALYSIS_WINDOW_DAYS * 86_400_000;
			if (Number.isNaN(t) || t <= horizon) return { kind: 'ok', fixture, homeTeam, awayTeam };
			console.warn(
				`[résolution] HORS FENÊTRE « ${matchText} » — match trouvé le ${fixture.dateUtc}, au-delà de la période analysée (${ANALYSIS_WINDOW_DAYS} j)`
			);
			return { kind: 'hors_fenetre', homeTeam, awayTeam };
		}
		console.warn(
			`[résolution] NON RETROUVÉ « ${matchText} » — équipes reconnues, mais aucun match entre elles en base`
		);
		return { kind: 'non_resolu' };
	}

	// Au moins un côté non résolu : on diagnostique CHAQUE côté manquant.
	const manquants = ([[rawHome, homeTeam], [rawAway, awayTeam]] as const)
		.filter(([, t]) => !t)
		.map(([raw]) => ({ raw, key: aliasFor(normalize(raw)), cands: candidatesFor(raw, teams) }));
	const avecCandidat = manquants.some((m) => m.cands.length > 0);
	const label = avecCandidat ? 'NON RÉSOLU (alias manquant probable)' : 'HORS COUVERTURE (aucun candidat)';
	console.warn(`[résolution] ${label} « ${matchText} »`);
	for (const m of manquants) {
		const c = m.cands.length ? m.cands.map((t) => t.nom).join(', ') : '(aucun candidat en base)';
		console.warn(`    côté « ${m.raw} » → clé « ${m.key} » → candidats : ${c}`);
	}
	return avecCandidat ? { kind: 'non_resolu' } : { kind: 'hors_couverture' };
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
	// Nom normalisé → club_id, construit une fois pour tout le ticket. Sert à
	// retrouver un match par CLUB quelle que soit l'entité (compétition) qui le porte.
	const clubByName = new Map<string, number>();
	for (const t of teams) clubByName.set(normalize(t.nom), clubOf(t));

	return raw.lignes.map((ligne, i): Selection => {
		const ordre = i + 1;
		const { matchText, marketText, odds } = lineParts(ligne);
		const diag = diagnoseMatch(matchText, fixtures, teams, clubByName);

		// Match non résolu : QUATRE causes distinctes, quatre messages honnêtes.
		// « hors_couverture » n'est plus le fourre-tout — il est réservé au cas où
		// AUCUN candidat n'existe en base (championnat vraiment absent du catalogue).
		if (diag.kind !== 'ok') {
			const raison =
				diag.kind === 'illisible'
					? 'inconnu'
					: diag.kind === 'hors_fenetre'
						? 'hors_fenetre'
						: diag.kind === 'non_resolu'
							? 'non_resolu'
							: 'hors_couverture';
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

		const fx = { fixture: diag.fixture, home: diag.homeTeam.nom, away: diag.awayTeam.nom };
		const market = resolveMarketForFixture(marketText, diag.homeTeam, diag.awayTeam);

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
