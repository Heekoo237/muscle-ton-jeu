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
import type { Fixture, Market, Selection, Team } from '$lib/types';
import type { MarketConcept, RawLine, RawTicketRead } from '$lib/server/services/vision';
import {
	resolveMarket,
	marketLabelFr,
	splitResultMarket,
	matchesUncovered,
	type MarketResolution
} from './market-map';
import { aliasFor } from './team-aliases';
import { ANALYSIS_WINDOW_DAYS } from './window';
import { pairMatchFixture, pairMatchNoSep, TAU_PAIRE, MARGE_PAIRE } from './pair-match';
import { teamSimilarity } from './similarity';

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

/**
 * Reconnaît les deux équipes d'une ligne « A – B » (réutilise `matchTeam`, le
 * matching interne, pour une SEULE source de vérité). Utilisé par la récupération à
 * la demande : décider si on peut interroger la ligue d'un match NON RÉSOLU (les
 * deux équipes connues mais aucun fixture ne les oppose). Ne devine jamais : un côté
 * non reconnu ressort `null`.
 */
export function reconnaitreEquipes(
	matchText: string,
	teams: Team[]
): { home: Team | null; away: Team | null } {
	const sides = matchText.split(/\s+[-–]\s+/).map((s) => s.trim());
	if (sides.length < 2) return { home: null, away: null };
	return { home: matchTeam(sides[0], teams), away: matchTeam(sides[1], teams) };
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
	| { kind: 'commence'; homeTeam: Team; awayTeam: Team }
	| { kind: 'non_resolu' }
	| { kind: 'hors_couverture' }
	| { kind: 'illisible' };

/**
 * Fixture résolu + équipes → diagnostic daté : déjà commencé, hors fenêtre, ou ok.
 * Extrait pour être PARTAGÉ par le chemin nom-par-nom ET le rattrapage par paire
 * (même règle temporelle, une seule fois).
 */
function windowDiag(fixture: Fixture, home: Team, away: Team, matchText: string): MatchDiag {
	const t = Date.parse(fixture.dateUtc);
	const now = Date.now();
	// Coup d'envoi PASSÉ → on n'analyse pas (une analyse d'avant-match n'a plus de
	// sens, et laisserait croire qu'on prédit un résultat déjà en cours).
	if (!Number.isNaN(t) && t <= now) {
		console.warn(`[résolution] DÉJÀ COMMENCÉ « ${matchText} » — coup d'envoi ${fixture.dateUtc}, passé`);
		return { kind: 'commence', homeTeam: home, awayTeam: away };
	}
	// Trouvé mais au-delà de la période analysée.
	if (!Number.isNaN(t) && t > now + ANALYSIS_WINDOW_DAYS * 86_400_000) {
		console.warn(
			`[résolution] HORS FENÊTRE « ${matchText} » — match trouvé le ${fixture.dateUtc}, au-delà de la période analysée (${ANALYSIS_WINDOW_DAYS} j)`
		);
		return { kind: 'hors_fenetre', homeTeam: home, awayTeam: away };
	}
	return { kind: 'ok', fixture, homeTeam: home, awayTeam: away };
}

/**
 * Séparateur « équipe domicile / équipe extérieur » d'un libellé de match, tolérant
 * aux notations des différents bookmakers — c'est la SEULE façon de lire « A ___ B ».
 * Reconnus : tiret court/long/cadratin (- – —), « vs » / « v » / « v. » / « vs. »
 * (anglais), barre oblique, point médian.
 *
 * DEUX garde-fous contre le faux positif (un séparateur qui coupe un NOM) :
 *  1. ESPACES OBLIGATOIRES autour — « Saint-Étienne », « PSV », « 1. FC Köln » ont
 *     leur tiret/point COLLÉ, jamais entouré d'espaces : ils ne sont donc jamais
 *     coupés. Seul un séparateur isolé compte.
 *  2. PREMIÈRE occurrence, home non gourmand (`.+?`) — « A vs B » → « A » | « B », un
 *     seul point de coupe, jamais un émiettement en trois.
 * Filet ultime : si la coupe désigne deux équipes qui n'existent pas, on retombe en
 * `non_resolu` (pas retrouvé), jamais sur une fausse analyse — le pire cas est honnête.
 */
const SEP_EQUIPES = /^(.+?)\s+(?:[-–—]|vs?\.?|\/|·)\s+(.+)$/i;

function diagnoseMatch(
	matchText: string,
	fixtures: Fixture[],
	teams: Team[],
	clubByName: Map<string, number>,
	teamByName: Map<string, Team>
): MatchDiag {
	const m = matchText.match(SEP_EQUIPES);
	const rawHome = m ? m[1].trim() : '';
	const rawAway = m ? m[2].trim() : '';
	// Séparateur ABSENT ou inconnu (« A contre B », « A : B », « A B ») → on ne bloque
	// pas : rattrapage SANS séparateur — on cherche deux équipes de la base qui se
	// rencontrent dans le texte. C'est ce qui rend la lecture robuste à TOUT bookmaker,
	// pas seulement à ceux dont on a listé le séparateur. Le côté vient du fixture.
	if (!m || rawHome.length < 2 || rawAway.length < 2) {
		const sansSep = pairMatchNoSep(matchText, fixtures);
		if (sansSep.decision === 'ok') {
			const ph = teamByName.get(normalize(sansSep.fixture.teamHome));
			const pa = teamByName.get(normalize(sansSep.fixture.teamAway));
			if (ph && pa) {
				console.warn(
					`[résolution] RÉSOLU SANS SÉPARATEUR « ${matchText} » → ${sansSep.fixture.teamHome} - ` +
						`${sansSep.fixture.teamAway} (fixture ${sansSep.fixture.id}, score ${sansSep.score.toFixed(2)})`
				);
				return windowDiag(sansSep.fixture, ph, pa, matchText);
			}
		}
		if (sansSep.decision === 'ambigu') {
			console.warn(`[résolution] SANS SÉPARATEUR AMBIGU « ${matchText} » — deux paires proches, on ne devine pas`);
			return { kind: 'non_resolu' };
		}
		return { kind: 'illisible' };
	}
	const homeTeam = matchTeam(rawHome, teams);
	const awayTeam = matchTeam(rawAway, teams);

	if (homeTeam && awayTeam) {
		// On cherche par CLUB, pas par entité : le match de ce soir peut être rattaché
		// à « Stade de Reims » [L2] alors que le ticket a résolu « Reims » [L1] — même
		// club, club_id commun. Sans réconciliation, clubOf = id propre → comportement
		// d'avant (on ne casse rien tant que club_id n'est pas rempli).
		const homeClub = clubOf(homeTeam);
		const awayClub = clubOf(awayTeam);
		const fxHomeClub = (f: Fixture) => clubByName.get(normalize(f.teamHome));
		const fxAwayClub = (f: Fixture) => clubByName.get(normalize(f.teamAway));
		let fixture = fixtures.find((f) => fxHomeClub(f) === homeClub && fxAwayClub(f) === awayClub);
		// ORDRE INVERSÉ — certains bookmakers affichent l'extérieur à gauche. On tente
		// l'orientation inverse, mais SEULEMENT si elle désigne UN SEUL match (sinon on
		// ne devine pas). Le côté (domicile/extérieur) sera ensuite lu sur le fixture
		// RÉSOLU, jamais sur l'ordre du ticket : c'est là tout l'intérêt du redressement.
		if (!fixture) {
			const inverses = fixtures.filter((f) => fxHomeClub(f) === awayClub && fxAwayClub(f) === homeClub);
			if (inverses.length === 1) fixture = inverses[0];
			else if (inverses.length > 1) {
				console.warn(
					`[résolution] ORDRE INVERSÉ AMBIGU « ${matchText} » — plusieurs matchs entre ces équipes, on ne devine pas`
				);
				return { kind: 'non_resolu' };
			}
		}
		// Le CÔTÉ vient de la donnée : on rattache home/away aux équipes du fixture
		// résolu, pas à l'ordre du ticket. En orientation inverse, la gauche du ticket
		// est l'extérieur réel — sans ce redressement, whichSide se tromperait de camp.
		const trueHome = fixture && fxHomeClub(fixture) === homeClub ? homeTeam : awayTeam;
		const trueAway = trueHome === homeTeam ? awayTeam : homeTeam;
		if (fixture) {
			// OBSERVATION (mode B) : on calcule aussi ce que la PAIRE aurait donné et on
			// journalise les DÉSACCORDS. Cas dangereux : le nom-par-nom réussit avec la
			// MAUVAISE équipe et la paire n'est jamais consultée. Cette mesure (quelques ms)
			// décidera du passage au chemin principal (mode A) sur des données, pas au juger.
			const pair = pairMatchFixture(rawHome, rawAway, fixtures);
			if (pair.decision === 'ok' && pair.fixture.id !== fixture.id) {
				console.warn(
					`[résolution] DÉSACCORD PAIRE « ${matchText} » — nom-par-nom → fixture ${fixture.id}, ` +
						`paire → fixture ${pair.fixture.id} (${pair.fixture.teamHome} - ${pair.fixture.teamAway}, ` +
						`score ${pair.score.toFixed(2)}). À examiner.`
				);
			}
			// « Hors fenêtre » N'EST vrai que si un match existe RÉELLEMENT entre ces deux
			// équipes, à une date au-delà de la période analysée. Sinon → non_resolu.
			return windowDiag(fixture, trueHome, trueAway, matchText);
		}
		// Les deux NOMS ont résolu, mais AUCUN fixture ne les oppose par club_id. Deux causes :
		//  - c'est vrai (ces deux clubs ne jouent pas dans la fenêtre) ;
		//  - matchTeam a pointé la MAUVAISE entité : un alias court (« racing ») d'un AUTRE
		//    club a happé un nom plus long (« Racing de Santander » → le Racing d'Argentine).
		//    Le club résolu ne colle alors avec aucun fixture réel.
		// FILET PAIRE : on tente l'appariement par paire AVANT d'abandonner. Contrairement à
		// l'ancienne crainte, c'est SÛR : pairMatchFixture ne résout que vers un fixture dont
		// les DEUX noms ressemblent, avec garde de marge — il ne peut pas fusionner deux clubs
		// distincts, il ne fait que CORRIGER un mauvais nom-par-nom vers le vrai match.
		const paire = pairMatchFixture(rawHome, rawAway, fixtures);
		if (paire.decision === 'ok') {
			const ph = teamByName.get(normalize(paire.fixture.teamHome));
			const pa = teamByName.get(normalize(paire.fixture.teamAway));
			if (ph && pa) {
				console.warn(
					`[résolution] PAIRE CORRIGE « ${matchText} » — nom-par-nom → ${homeTeam.nom} #${homeTeam.id} (club ${clubOf(homeTeam)}) vs ${awayTeam.nom} #${awayTeam.id} (club ${clubOf(awayTeam)}), ` +
						`aucun match ; paire → ${paire.fixture.teamHome} - ${paire.fixture.teamAway} (fixture ${paire.fixture.id}, score ${paire.score.toFixed(2)})`
				);
				return windowDiag(paire.fixture, ph, pa, matchText);
			}
		}
		// Toujours rien : on JOURNALISE quelles entités ont été reconnues (l'info qui manquait)
		// — sans ça, « équipes reconnues » ne dit pas LESQUELLES.
		console.warn(
			`[résolution] NON RETROUVÉ « ${matchText} » — reconnu comme ${homeTeam.nom} #${homeTeam.id} ` +
				`(club ${clubOf(homeTeam)}) vs ${awayTeam.nom} #${awayTeam.id} (club ${clubOf(awayTeam)}), ` +
				`aucun match entre eux, ni par paire (${paire.decision}, score ${paire.score.toFixed(2)})`
		);
		return { kind: 'non_resolu' };
	}

	// AU MOINS UN NOM NON RÉSOLU → RATTRAPAGE PAR PAIRE. On cherche l'unique fixture
	// dont les DEUX équipes ressemblent aux deux noms du ticket. Le contexte du match
	// lève l'ambiguïté qu'un nom seul ne peut pas lever (« Séville »/« Sevilla »). Sûr
	// parce que : score = min des deux côtés, un seul candidat franc requis (marge),
	// et le côté est lu sur le fixture. Deux candidats proches → on ne devine pas.
	const pair = pairMatchFixture(rawHome, rawAway, fixtures);
	if (pair.decision === 'ok') {
		const ph = teamByName.get(normalize(pair.fixture.teamHome));
		const pa = teamByName.get(normalize(pair.fixture.teamAway));
		if (ph && pa) {
			console.warn(
				`[résolution] RÉSOLU PAR PAIRE « ${matchText} » → ${pair.fixture.teamHome} - ${pair.fixture.teamAway} ` +
					`(fixture ${pair.fixture.id}, score ${pair.score.toFixed(2)}, marge ${(pair.score - pair.second).toFixed(2)})`
			);
			return windowDiag(pair.fixture, ph, pa, matchText);
		}
	} else if (pair.decision === 'ambigu') {
		console.warn(
			`[résolution] PAIRE AMBIGUË « ${matchText} » — deux matchs proches ` +
				`(meilleur ${pair.score.toFixed(2)}, second ${pair.second.toFixed(2)}), on ne devine pas`
		);
		return { kind: 'non_resolu' };
	}

	// Ni nom-par-nom ni paire : on diagnostique CHAQUE côté manquant (alias vs couverture).
	const manquants = ([[rawHome, homeTeam], [rawAway, awayTeam]] as const)
		.filter(([, t]) => !t)
		.map(([raw]) => ({ raw, key: aliasFor(normalize(raw)), cands: candidatesFor(raw, teams) }));
	const avecCandidat = manquants.some((m) => m.cands.length > 0);
	const label = avecCandidat ? 'NON RÉSOLU (alias manquant probable)' : 'HORS COUVERTURE (aucun candidat)';
	console.warn(`[résolution] ${label} « ${matchText} » (paire: ${pair.decision}, score ${pair.score.toFixed(2)})`);
	for (const m of manquants) {
		const c = m.cands.length ? m.cands.map((t) => t.nom).join(', ') : '(aucun candidat en base)';
		console.warn(`    côté « ${m.raw} » → clé « ${m.key} » → candidats : ${c}`);
	}
	return avecCandidat ? { kind: 'non_resolu' } : { kind: 'hors_couverture' };
}

const DRAW_WORDS = new Set(['nul', 'match nul', 'draw', 'x', 'egalite']);

// FILET POSITIONNEL (défense en profondeur). La vision a l'ordre STRICT de rendre un
// NOM d'équipe, jamais « 1 »/« V1 »/« domicile » (prompt). Mais un prompt n'est pas une
// garantie : si la vision désobéit, on ne veut pas un refus muet « on n'a pas pu lire ».
// On interprète alors une liste FERMÉE de codes positionnels — et le côté vient TOUJOURS
// du FIXTURE (home/away de la base), JAMAIS de l'ordre du texte : la règle d'or tient.
// N'est consulté qu'en DERNIER, après échec de la résolution par nom (jamais un « 1 »
// avalé dans un nom d'équipe). Un code hors liste → INCONNU, comme avant.
const POS_HOME = new Set(['1', 'v1', 'p1', 'victoire 1', 'vic 1', 'domicile', 'dom', 'home', 'local', 'equipe 1', 'eq1']);
const POS_AWAY = new Set(['2', 'v2', 'p2', 'victoire 2', 'vic 2', 'exterieur', 'ext', 'away', 'visiteur', 'equipe 2', 'eq2']);
/** Code positionnel → côté, ou null si ce n'en est pas un. PURE, liste fermée. */
function positionnel1x2(c: string): 'home' | 'away' | null {
	if (POS_HOME.has(c)) return 'home';
	if (POS_AWAY.has(c)) return 'away';
	return null;
}
/** Double chance positionnelle (1X / X2 / 12, et variantes 1N / N2). Ensemble de côtés. */
function positionnelDc(c: string): Set<string> | null {
	const map: Record<string, [string, string]> = {
		'1x': ['home', 'draw'], '1n': ['home', 'draw'], 'x1': ['home', 'draw'], 'n1': ['home', 'draw'],
		x2: ['draw', 'away'], n2: ['draw', 'away'], '2x': ['draw', 'away'], '2n': ['draw', 'away'],
		'12': ['home', 'away'], '21': ['home', 'away']
	};
	const hit = map[c.replace(/\s+/g, '')];
	return hit ? new Set(hit) : null;
}

/**
 * À quel camp du match correspond ce choix ? Exact/alias d'abord ; à défaut, repli
 * par RESSEMBLANCE — nécessaire quand le fixture a été résolu par paire (nom flou
 * comme « FC Séville ») : le choix est alors l'un des deux noms du ticket et ressemble
 * fortement à l'une des deux équipes. Choix BINAIRE, même garde-fou de marge que la
 * paire : on ne tranche que si un côté domine nettement l'autre, sinon null.
 */
function whichSide(choice: string, home: Team, away: Team): 'home' | 'away' | null {
	const t = matchTeam(choice, [home, away]);
	if (t) return normalize(t.nom) === normalize(home.nom) ? 'home' : 'away';
	const sh = teamSimilarity(choice, home.nom);
	const sa = teamSimilarity(choice, away.nom);
	if (Math.max(sh, sa) >= TAU_PAIRE && Math.abs(sh - sa) >= MARGE_PAIRE) return sh > sa ? 'home' : 'away';
	return null;
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

const INCONNU: MarketResolution = { state: 'inconnu', market: null, raison: 'inconnu' };
const SEUILS_COUVERTS = new Set([1.5, 2.5, 3.5]);

/**
 * Résout le marché depuis le CONCEPT lu par la vision (famille + choix relatif).
 * Le code fait tout le jugement : il vérifie que la famille est couverte, redresse
 * le CÔTÉ depuis le fixture (jamais depuis l'ordre du ticket), contraint le seuil à
 * {1,5 · 2,5 · 3,5} ET le recoupe contre le texte lu. Tout ce qui ne colle pas →
 * INCONNU (jamais deviné) : l'appelant retombera alors sur la table de secours.
 *
 * `rawMarketText` sert au RECOUPEMENT du seuil : un seuil annoncé par la vision mais
 * ABSENT du texte est un seuil possiblement mal lu — on refuse (il sélectionnerait
 * une autre probabilité sans qu'on le voie). Règle d'or n°1, jusque dans le seuil.
 */
function resolveConcept(
	concept: MarketConcept,
	rawMarketText: string,
	home: Team,
	away: Team
): MarketResolution {
	switch (concept.famille) {
		case 'NON_COUVERT': {
			// FILET : la vision N'EST PAS déterministe et déclare parfois NON_COUVERT un
			// marché en fait COUVERT (ex. « Total: (1.5) Plus de » = plus de 1,5 but). Le
			// TEXTE est la vérité, le concept un simple avis. Si la table de secours résout
			// le texte AVEC CERTITUDE (elle a son propre recoupement de seuil, règle d'or
			// n°1), le texte prime ; sinon on garde non_couvert. On ne fabrique aucun
			// nombre : on lit le marché depuis le texte, jamais depuis l'avis de la vision.
			const secours = resolveMarketForFixture(rawMarketText, home, away);
			if (secours.state === 'certain') return secours;
			return { state: 'inconnu', market: null, raison: 'non_couvert' };
		}
		case 'INCONNU':
			return INCONNU;
		case 'RESULTAT_1X2': {
			const c = normalize(concept.choix ?? '');
			if (!c) return INCONNU; // issue vide : lecture incomplète, jamais devinée
			if (DRAW_WORDS.has(c)) return { state: 'certain', market: 'DRAW' };
			const side = whichSide(concept.choix ?? '', home, away);
			if (side === 'home') return { state: 'certain', market: 'WIN_HOME' };
			if (side === 'away') return { state: 'certain', market: 'WIN_AWAY' };
			// FILET : le nom n'a pas résolu. La vision a-t-elle rendu un positionnel
			// (« V1 »/« 1 »/« domicile ») malgré le prompt ? Côté lu sur le fixture, pas le texte.
			const pos = positionnel1x2(c);
			if (pos) {
				console.warn(`[résolution] FILET POSITIONNEL 1X2 « ${concept.choix} » → ${pos} (côté du fixture) — la vision a rendu un positionnel malgré le prompt`);
				return { state: 'certain', market: pos === 'home' ? 'WIN_HOME' : 'WIN_AWAY' };
			}
			return INCONNU; // choix ne correspond à aucune équipe, ni « Nul », ni un positionnel connu
		}
		case 'DOUBLE_CHANCE': {
			const parts = concept.composantes ?? [];
			let sides = new Set<string>();
			for (const p of parts) {
				if (DRAW_WORDS.has(normalize(p))) sides.add('draw');
				else {
					const s = whichSide(p, home, away);
					if (s) sides.add(s);
				}
			}
			// FILET : composantes non résolues par nom → la vision a-t-elle rendu une
			// notation positionnelle « 1X »/« 12 »/« X2 » ? Côté toujours lu sur le fixture.
			if (sides.size < 2) {
				const pos = positionnelDc(normalize(concept.choix ?? parts.join(' ')));
				if (pos) {
					console.warn(`[résolution] FILET POSITIONNEL double chance « ${concept.choix ?? parts.join(' ')} » → ${[...pos].join('+')}`);
					sides = pos;
				}
			}
			if (sides.has('home') && sides.has('draw')) return { state: 'certain', market: 'DC_HOME_DRAW' };
			if (sides.has('away') && sides.has('draw')) return { state: 'certain', market: 'DC_DRAW_AWAY' };
			if (sides.has('home') && sides.has('away')) return { state: 'certain', market: 'DC_HOME_AWAY' };
			return INCONNU;
		}
		case 'PLUS_MOINS': {
			const seuil = concept.seuil;
			if (typeof seuil !== 'number') return INCONNU; // aucun seuil lu → incertain
			// Seuil HORS COUVERTURE (0,5 · 1 · 4,5 · ligne asiatique · total de mi-temps) :
			// ce n'est PAS un arrondi possible vers 1,5/2,5/3,5 — c'est un pari qu'on ne
			// couvre pas. On le dit (non_couvert), on ne le traite jamais comme couvert.
			// C'est le garde-fou contre la réécriture « (1) » → « 1,5 » : un seuil non
			// couvert ne devient JAMAIS un seuil couvert (règle d'or n°1).
			if (!SEUILS_COUVERTS.has(seuil)) return { state: 'inconnu', market: null, raison: 'non_couvert' };
			// RECOUPEMENT : le seuil couvert annoncé DOIT figurer TEL QUEL dans le texte
			// brut. Un seuil COUVERT mal lu (2,5 lu 3,5) échoue ici → secours texte, qui
			// relira le VRAI seuil depuis la capture. Un « (1) » réécrit en « 1,5 » par la
			// vision échoue aussi (le « 1,5 » n'est pas dans le texte) → jamais analysé.
			const present = new RegExp(`${String(seuil)[0]}[.,]5`).test(rawMarketText);
			if (!present) return INCONNU;
			if (concept.direction !== 'PLUS' && concept.direction !== 'MOINS') return INCONNU;
			const tag = seuil === 1.5 ? '1_5' : seuil === 2.5 ? '2_5' : '3_5';
			return { state: 'certain', market: `${concept.direction === 'PLUS' ? 'OVER' : 'UNDER'}_${tag}` as Market };
		}
		case 'BTTS':
			if (concept.btts === 'NON') return { state: 'certain', market: 'BTTS_NO' };
			if (concept.btts === 'OUI') return { state: 'certain', market: 'BTTS_YES' };
			return INCONNU;
	}
}

/**
 * Résolution du marché AVEC le concept de la vision quand il existe, table de
 * secours sinon. L'ordre encode les priorités validées :
 *  1. SECOND FILET non-couvert : un terme non-couvert dans le TEXTE l'emporte, même
 *     sur une famille couverte annoncée — « on préfère refuser que d'analyser le
 *     mauvais marché » (le piège « both teams to score » est traité dans `matchesUncovered`) ;
 *  2. CONCEPT : s'il résout avec certitude (ou dit explicitement non-couvert), il prime ;
 *  3. SECOURS TEXTE : famille absente ou INCONNU → table + heuristiques (comportement
 *     historique), qui gère aussi l'AMBIGU (« Over » sans seuil → trois choix).
 */
function resolveMarketWithConcept(
	marketText: string,
	concept: MarketConcept | undefined,
	home: Team,
	away: Team
): MarketResolution {
	if (concept) {
		if (matchesUncovered(marketText)) {
			return { state: 'inconnu', market: null, raison: 'non_couvert' };
		}
		const byConcept = resolveConcept(concept, marketText, home, away);
		if (byConcept.state === 'certain' || byConcept.raison === 'non_couvert') return byConcept;
		// INCONNU du concept → on tente la table de secours sur le texte.
	}
	return resolveMarketForFixture(marketText, home, away);
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
	// Nom normalisé → équipe : sert au rattrapage par paire à récupérer les Team du
	// fixture résolu (pour whichSide et le libellé), sans re-résoudre les noms.
	const teamByName = new Map<string, Team>();
	for (const t of teams) teamByName.set(normalize(t.nom), t);

	const selections = raw.lignes.map((ligne, i): Selection => {
		const ordre = i + 1;
		const { matchText, marketText, odds } = lineParts(ligne);
		const diag = diagnoseMatch(matchText, fixtures, teams, clubByName, teamByName);

		// Match non résolu : QUATRE causes distinctes, quatre messages honnêtes.
		// « hors_couverture » n'est plus le fourre-tout — il est réservé au cas où
		// AUCUN candidat n'existe en base (championnat vraiment absent du catalogue).
		if (diag.kind !== 'ok') {
			const raison =
				diag.kind === 'illisible'
					? 'inconnu'
					: diag.kind === 'commence'
						? 'commence'
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
		// Concept vision d'abord (côté redressé sur le fixture), table de secours ensuite.
		const market = resolveMarketWithConcept(marketText, ligne.concept, diag.homeTeam, diag.awayTeam);

		const matchLabel = `${fx.home} – ${fx.away}`;

		if (market.state === 'certain' && market.market) {
			return {
				ordre,
				texteBrut: ligne.texteBrut,
				matchLabel,
				// SNAPSHOT d'orientation : l'id domicile/extérieur du fixture AU MOMENT de
				// l'analyse. Le règlement s'y réfère pour rester juste si le fixture est
				// retourné plus tard (voir migration 0025 et settle.selectionOutcome).
				equipeDomId: fx.fixture.teamHomeId,
				equipeExtId: fx.fixture.teamAwayId,
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

	// MESURE DE VARIABILITÉ VISION — symptôme exact du bug « issue manquante » : un
	// marché de type 1X2 / double chance RECONNU mais dont l'issue pariée est VIDE.
	// La vision n'est pas déterministe ; ce compteur rend le taux visible sans
	// attendre une plainte. Marqueur stable `[résolution] LECTURE INCOMPLÈTE`.
	const incompletes = incompleteReads(selections, raw);
	if (incompletes > 0) {
		console.warn(
			`[résolution] LECTURE INCOMPLÈTE : ${incompletes}/${selections.length} ligne(s) — ` +
				`marché reconnu, issue vide (variabilité vision, à relire).`
		);
	}
	return selections;
}

/**
 * Nombre de lignes en « lecture incomplète » : match RÉSOLU (fixtureId présent),
 * marché de type 1X2 / double chance RECONNU, mais issue pariée VIDE. C'est le
 * symptôme exact d'une lecture vision qui a omis l'issue. UNE définition, partagée
 * par le log de résolution, le déclencheur de retry (action analyser) et la mesure
 * quotidienne (surveillance). Corrélation par index : `selections` est le map de
 * `raw.lignes` dans le même ordre.
 */
export function incompleteReads(selections: Selection[], raw: RawTicketRead): number {
	let n = 0;
	for (let i = 0; i < selections.length; i++) {
		const s = selections[i];
		if (s.etatResolution === 'certain' || s.fixtureId == null) continue;
		// Deux symptômes de la même panne (issue omise), selon le chemin de lecture :
		//  - CONCEPT : famille de résultat annoncée mais choix/composantes vides ;
		//  - TEXTE  : type 1X2 / double chance reconnu mais issue vide (secours).
		const concept = raw.lignes[i].concept;
		if (concept) {
			const choixVide =
				(concept.famille === 'RESULTAT_1X2' && !normalize(concept.choix ?? '')) ||
				(concept.famille === 'DOUBLE_CHANCE' && (concept.composantes?.length ?? 0) < 2);
			if (choixVide) {
				n++;
				continue;
			}
		}
		const sp = splitResultMarket(lineParts(raw.lignes[i]).marketText);
		if (sp && (sp.kind === '1x2' || sp.kind === 'dc') && normalize(sp.choice) === '') n++;
	}
	return n;
}
