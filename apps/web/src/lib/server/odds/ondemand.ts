/**
 * ondemand.ts — Récupération À LA DEMANDE des cotes manquantes, au moment de la
 * VALIDATION d'un ticket (chemin d'ÉCRITURE). Comble le trou « pas encore de
 * données » : une ligne résolue sans probabilité déclenche un appel The Odds API
 * pour SON championnat, un dévigeage déterministe (même fonction que le collecteur,
 * `devig.ts`, verrouillée par test doré) et une écriture dans `predictions`. Ensuite
 * /resultat LIT normalement (règle d'archi n°2 : le temps réel ne calcule jamais).
 *
 * Invariants tenus, tous VÉRIFIÉS ailleurs ou ici :
 *  - Règle d'or n°1 : la proba vient du dévigeage (calcul), jamais d'un LLM.
 *  - CIBLAGE PAR MARCHÉ JOUÉ : on n'appelle QUE si le marché réellement parié manque.
 *    Un « Boca gagne » (1X2) ne déclenche jamais l'appel par événement (BTTS, ±1,5,
 *    ±3,5). Un marché déjà connu (modèle OU cote seule) ne déclenche aucun appel.
 *  - Budget < 2 s : un délai DUR PARTAGÉ (`Budget`) borne TOUS les appels des DEUX
 *    passes (cotes manquantes + matchs non résolus). Appels ligue EN PARALLÈLE,
 *    concurrence plafonnée à `CONCURRENCE` — la 3ᵉ ligue n'est plus affamée.
 *  - Panne = repli SILENCIEUX : aucune exception ne remonte à l'appelant.
 *  - Dédup (ligue + récence) : 20 utilisateurs sur le même match paient une fois.
 *  - Disjoncteur : trop d'échecs récents → on CESSE d'appeler (repli collecteur seul).
 *  - Journal SANS ANGLE MORT : chaque appel ET chaque ABANDON est tracé avec sa
 *    raison (`ondemand_calls.raison`), agrégé dans `/api/health/ondemand`. Un
 *    `matchs_ecrits = 0` n'est plus un silence.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { predictions } from '$lib/server/services';
import type { Fixture, Market, Selection, Team } from '$lib/types';
import { resolveTicket, reconnaitreEquipes } from '$lib/server/domain/resolve';
import {
	providerConfigured,
	fetchLeagueOdds,
	fetchEventExtras,
	type EvenementCotes
} from './provider';
import { devigMarches, type ProbaCote } from './devig';

/** Délai DUR par défaut, partagé par tous les appels d'une validation. Jamais > 2 s. */
const DEADLINE_MS = 1500;
/** On arrête d'engager un appel s'il reste moins que ça (le fetch n'aurait pas le temps). */
const MARGE_MS = 200;
/** Dédup : une même ligue (resp. un même événement) n'est ré-interrogée qu'après ce délai. */
const DEDUP_TTL_S = 900; // 15 min
/** Appels ligue simultanés MAX : couvre un ticket réel en une vague, borne les connexions. */
const CONCURRENCE = 5;
/** Plafond d'appels PAR ÉVÉNEMENT (marchés additionnels) sur une même validation. */
const MAX_APPELS_EVENEMENT = 4;
/** Disjoncteur : fenêtre, minimum d'essais avant de conclure, seuil d'échec. */
const CIRCUIT = { fenetreS: 1800, minEssais: 8, seuil: 0.5 };
/** Confiance et seuil FIXES du régime cote seule (miroir de `constants.py`). */
const CONFIANCE_COTE_SEULE = 0.33; // CONFIDENCE_VALUE["faible"]
const SEUIL_FRAGILE_COTE_SEULE = 0.5; // FRAGILE_THRESHOLD_COTE_SEULE

/** Marchés servis par l'appel LIGUE (h2h + totals 2,5, + double chance dérivée). */
const LEAGUE_MARKETS: ReadonlySet<Market> = new Set<Market>([
	'WIN_HOME',
	'DRAW',
	'WIN_AWAY',
	'DC_HOME_DRAW',
	'DC_DRAW_AWAY',
	'DC_HOME_AWAY',
	'OVER_2_5',
	'UNDER_2_5'
]);
/** Marchés servis par l'appel PAR ÉVÉNEMENT (alternate_totals 1,5/3,5 + BTTS). */
const EVENT_MARKETS: ReadonlySet<Market> = new Set<Market>([
	'OVER_1_5',
	'UNDER_1_5',
	'OVER_3_5',
	'UNDER_3_5',
	'BTTS_YES',
	'BTTS_NO'
]);

/** Quel appel sert ce marché ? (pilote le ciblage — testé). */
export function besoinDe(marche: Market): 'league' | 'event' | null {
	if (LEAGUE_MARKETS.has(marche)) return 'league';
	if (EVENT_MARKETS.has(marche)) return 'event';
	return null;
}

/** Budget de temps DUR partagé entre les deux passes d'une validation. */
export interface Budget {
	restant(): number;
}
export function nouveauBudget(ms: number = DEADLINE_MS): Budget {
	const t0 = Date.now();
	return { restant: () => Math.max(0, ms - (Date.now() - t0)) };
}

/** Une ligne du ticket à combler : le match ET le marché réellement joué. */
export interface PickCible {
	fixtureId: number;
	marche: Market;
}

interface Cible {
	fixtureId: number;
	providerRef: string;
	sportKey: string;
}

export interface JournalOndemand {
	/** Lignes `predictions` réellement écrites. */
	ecrits: number;
	/** Appels fournisseur émis (ligue + événement). */
	appels: number;
	/** Crédits fournisseur consommés (somme des en-têtes x-requests-last). */
	credits: number;
	/**
	 * Fixtures INTERROGÉS mais dont le marché joué reste absent (le fournisseur ne
	 * price pas ce match) → message honnête « pas encore coté », distinct du
	 * transitoire « pas encore de données ».
	 */
	nonCotes: Set<number>;
}

const journalVide = (): JournalOndemand => ({ ecrits: 0, appels: 0, credits: 0, nonCotes: new Set() });

/**
 * D'OÙ part l'appel à la demande. La MÊME récupération tourne au chargement de
 * l'écran de validation (aperçu juste) ET au « finaliser » ; la dédup fait que le
 * finaliser ne rappelle jamais le fournisseur pour ce que la validation a déjà
 * demandé. On tag chaque ligne de journal de sa phase pour VOIR l'écart (colonne
 * `ondemand_calls.phase`, migration 0027).
 */
export type PhaseOndemand = 'validation' | 'finaliser';

type Ligne = ReturnType<typeof versLignes>[number];
/** Raison d'un abandon (persistée, agrégée dans /api/health/ondemand). */
type Raison =
	| 'ligue_non_mappee'
	| 'deja_connu'
	| 'budget'
	| 'plafond'
	| 'dedup'
	| 'non_apparie'
	| 'devigeage_vide';

/** Accumulateur de lignes de journal : on écrit TOUT en UNE insertion (latence). */
type NoteRow = {
	cle: string;
	kind: 'league' | 'event' | 'skip';
	ok: boolean;
	credits: number;
	matchs_ecrits: number;
	raison: string | null;
	erreur: string | null;
	phase: PhaseOndemand;
};
function creerJournalDb(phase: PhaseOndemand) {
	const rows: NoteRow[] = [];
	return {
		appel(cle: string, kind: 'league' | 'event', ok: boolean, credits: number, ecrits: number, erreur?: string) {
			rows.push({ cle, kind, ok, credits, matchs_ecrits: ecrits, raison: null, erreur: erreur ?? null, phase });
		},
		skip(cle: string, raison: Raison) {
			rows.push({ cle, kind: 'skip', ok: true, credits: 0, matchs_ecrits: 0, raison, erreur: null, phase });
		},
		async flush() {
			if (rows.length === 0) return;
			try {
				await supabaseAdmin().from('ondemand_calls').insert(rows);
			} catch {
				/* le journal ne doit jamais casser la validation */
			}
		}
	};
}

/** Dédup atomique : TRUE si CE serveur remporte le droit d'appeler `cle` maintenant. */
async function revendiquer(cle: string): Promise<boolean> {
	try {
		const { data, error } = await supabaseAdmin().rpc('hit_rate_limit', {
			p_cle: cle,
			p_fenetre_s: DEDUP_TTL_S,
			p_max: 1
		});
		if (error) return true; // fail-open : mieux vaut un appel de trop qu'un trou
		return data === true;
	} catch {
		return true;
	}
}

/** Disjoncteur ouvert ? (trop d'échecs récents). Fail-open : en cas de doute, fermé. */
async function circuitOuvert(): Promise<boolean> {
	try {
		const { data, error } = await supabaseAdmin().rpc('ondemand_circuit_ouvert', {
			p_fenetre_s: CIRCUIT.fenetreS,
			p_min_essais: CIRCUIT.minEssais,
			p_seuil: CIRCUIT.seuil
		});
		if (error) return false;
		return data === true;
	} catch {
		return false;
	}
}

/** Cibles à combler : fixtures À VENIR, résolus, mappés à une clé fournisseur. */
async function chargerCibles(fixtureIds: number[]): Promise<Cible[]> {
	if (fixtureIds.length === 0) return [];
	const admin = supabaseAdmin();
	const { data: fx } = await admin
		.from('fixtures')
		.select('id, provider_ref, league_id, date_utc, statut')
		.in('id', fixtureIds);
	const nowIso = new Date().toISOString();
	const rows = ((fx ?? []) as {
		id: number;
		provider_ref: string | null;
		league_id: number | null;
		date_utc: string;
		statut: string;
	}[]).filter((r) => r.provider_ref && r.league_id && r.statut === 'scheduled' && r.date_utc > nowIso);
	if (rows.length === 0) return [];
	const leagueIds = [...new Set(rows.map((r) => r.league_id as number))];
	const { data: lg } = await admin.from('leagues').select('id, provider_ref').in('id', leagueIds);
	const fdByLeague = new Map<number, string>();
	for (const l of (lg ?? []) as { id: number; provider_ref: string | null }[])
		if (l.provider_ref) fdByLeague.set(l.id, l.provider_ref);
	const fdCodes = [...new Set([...fdByLeague.values()])];
	if (fdCodes.length === 0) return [];
	const { data: cat } = await admin
		.from('league_catalog')
		.select('fd_code, odds_api_key')
		.in('fd_code', fdCodes);
	const keyByFd = new Map<string, string>();
	for (const c of (cat ?? []) as { fd_code: string; odds_api_key: string }[])
		keyByFd.set(c.fd_code, c.odds_api_key);
	const cibles: Cible[] = [];
	for (const r of rows) {
		const fd = fdByLeague.get(r.league_id as number);
		const sportKey = fd ? keyByFd.get(fd) : undefined;
		if (sportKey) cibles.push({ fixtureId: r.id, providerRef: r.provider_ref as string, sportKey });
	}
	return cibles;
}

/** Convertit les probas dévigées en lignes `predictions` (cote seule / dérivée). */
function versLignes(fixtureId: number, jour: string, probas: ProbaCote[]) {
	return probas.map((p) => ({
		fixture_id: fixtureId,
		marche: p.marche,
		jour_calcul: jour,
		probabilite: Number(p.probabilite.toFixed(4)),
		confiance: CONFIANCE_COTE_SEULE,
		source: p.source,
		seuil_fragile: SEUIL_FRAGILE_COTE_SEULE
	}));
}

/** Écrit un lot de lignes `predictions` (upsert idempotent). Renvoie le nombre écrit. */
async function ecrirePredictions(lignes: Ligne[]): Promise<number> {
	if (lignes.length === 0) return 0;
	const { error } = await supabaseAdmin()
		.from('predictions')
		.upsert(lignes, { onConflict: 'fixture_id,marche,jour_calcul' });
	return error ? 0 : lignes.length;
}

/**
 * Comble les probabilités manquantes pour les LIGNES JOUÉES (`picks`), UNIQUEMENT
 * sur le marché réellement parié. Appelé DANS le chemin d'écriture (validation),
 * jamais dans la lecture temps réel. Ne lève jamais. `budget` est partagé avec la
 * passe « matchs non résolus » pour que le total reste < 2 s.
 */
export async function remplirCotesManquantes(
	picks: PickCible[],
	budget: Budget = nouveauBudget(),
	phase: PhaseOndemand = 'finaliser'
): Promise<JournalOndemand> {
	const journal = journalVide();
	if (!providerConfigured() || !isSupabaseConfigured() || picks.length === 0) return journal;
	const jdb = creerJournalDb(phase);
	try {
		if (await circuitOuvert()) return journal; // repli collecteur seul (surveillance alerte)

		const fixtureIds = [...new Set(picks.map((p) => p.fixtureId))];
		const cibles = await chargerCibles(fixtureIds);
		const cibleById = new Map(cibles.map((c) => [c.fixtureId, c]));
		const dejaConnu = await predictions.forFixtures(cibles.map((c) => c.fixtureId));
		const connus = (fid: number) => new Set((dejaConnu.get(fid) ?? []).map((p) => p.marche));

		// CIBLAGE PAR MARCHÉ JOUÉ : on route chaque pari vers l'appel qui le sert, et
		// UNIQUEMENT si son marché manque encore. Déjà connu / non mappé → journalisé.
		const besoinLigue = new Map<string, Cible[]>();
		const besoinEvent: Cible[] = [];
		const pushUnique = (arr: Cible[], c: Cible) => {
			if (!arr.some((x) => x.fixtureId === c.fixtureId)) arr.push(c);
		};
		for (const p of picks) {
			const c = cibleById.get(p.fixtureId);
			if (!c) {
				jdb.skip(`fx:${p.fixtureId}`, 'ligue_non_mappee');
				continue;
			}
			if (connus(p.fixtureId).has(p.marche)) {
				jdb.skip(`od:lg:${c.sportKey}`, 'deja_connu'); // déjà analysable → aucun appel (économie)
				continue;
			}
			const besoin = besoinDe(p.marche);
			if (besoin === 'league') {
				const arr = besoinLigue.get(c.sportKey) ?? [];
				pushUnique(arr, c);
				besoinLigue.set(c.sportKey, arr);
			} else if (besoin === 'event') {
				pushUnique(besoinEvent, c);
			}
		}

		const jour = new Date().toISOString().slice(0, 10);
		const lignes: Ligne[] = [];
		const interrogees = new Set<number>();

		// ── Appel LIGUE — un par championnat, EN PARALLÈLE (concurrence plafonnée) ──
		const appelLigue = async (sportKey: string, cs: Cible[]) => {
			const cle = `od:lg:${sportKey}`;
			if (budget.restant() < MARGE_MS) {
				for (const c of cs) jdb.skip(cle, 'budget');
				return;
			}
			if (!(await revendiquer(cle))) {
				for (const c of cs) jdb.skip(cle, 'dedup');
				return;
			}
			try {
				const { evenements, credits } = await fetchLeagueOdds(sportKey, budget.restant());
				journal.credits += credits;
				journal.appels++;
				const parRef = new Map<string, EvenementCotes>(evenements.map((e) => [e.eventId, e]));
				let ecrits = 0;
				for (const c of cs) {
					interrogees.add(c.fixtureId);
					const ev = parRef.get(c.providerRef);
					if (!ev) {
						jdb.skip(cle, 'non_apparie');
						continue;
					}
					const nouv = devigMarches(ev.cotes).filter((p) => !connus(c.fixtureId).has(p.marche));
					if (nouv.length === 0) {
						jdb.skip(cle, 'devigeage_vide');
						continue;
					}
					const l = versLignes(c.fixtureId, jour, nouv);
					lignes.push(...l);
					ecrits += l.length;
				}
				jdb.appel(cle, 'league', true, credits, ecrits);
			} catch (e) {
				jdb.appel(cle, 'league', false, 0, 0, String(e));
			}
		};

		const groupes = [...besoinLigue.entries()];
		for (let i = 0; i < groupes.length; i += CONCURRENCE) {
			if (budget.restant() < MARGE_MS) {
				for (const [sk, cs] of groupes.slice(i)) for (const c of cs) jdb.skip(`od:lg:${sk}`, 'budget');
				break;
			}
			await Promise.all(groupes.slice(i, i + CONCURRENCE).map(([sk, cs]) => appelLigue(sk, cs)));
		}

		// ── Appel PAR ÉVÉNEMENT — marchés additionnels, plafonné, EN PARALLÈLE ──
		const appelEvent = async (c: Cible) => {
			const cle = `od:ev:${c.providerRef}`;
			if (budget.restant() < MARGE_MS) {
				jdb.skip(cle, 'budget');
				return;
			}
			if (!(await revendiquer(cle))) {
				jdb.skip(cle, 'dedup');
				return;
			}
			try {
				const { evenement, credits } = await fetchEventExtras(c.sportKey, c.providerRef, budget.restant());
				journal.credits += credits;
				journal.appels++;
				interrogees.add(c.fixtureId);
				let ecrits = 0;
				if (evenement) {
					const nouv = devigMarches(evenement.cotes).filter((p) => !connus(c.fixtureId).has(p.marche));
					if (nouv.length > 0) {
						const l = versLignes(c.fixtureId, jour, nouv);
						lignes.push(...l);
						ecrits += l.length;
					} else {
						jdb.skip(cle, 'devigeage_vide');
					}
				} else {
					jdb.skip(cle, 'non_apparie');
				}
				jdb.appel(cle, 'event', true, credits, ecrits);
			} catch (e) {
				jdb.appel(cle, 'event', false, 0, 0, String(e));
			}
		};

		const eventCibles = besoinEvent.slice(0, MAX_APPELS_EVENEMENT);
		for (const c of besoinEvent.slice(MAX_APPELS_EVENEMENT)) jdb.skip(`od:ev:${c.providerRef}`, 'plafond');
		for (let i = 0; i < eventCibles.length; i += CONCURRENCE) {
			if (budget.restant() < MARGE_MS) {
				for (const c of eventCibles.slice(i)) jdb.skip(`od:ev:${c.providerRef}`, 'budget');
				break;
			}
			await Promise.all(eventCibles.slice(i, i + CONCURRENCE).map((c) => appelEvent(c)));
		}

		journal.ecrits = await ecrirePredictions(lignes);

		// « Pas encore coté » : interrogé, rien d'écrit, et le marché joué reste absent.
		const ecritsParFixture = new Set(lignes.map((l) => l.fixture_id));
		for (const p of picks) {
			if (
				interrogees.has(p.fixtureId) &&
				!ecritsParFixture.has(p.fixtureId) &&
				!connus(p.fixtureId).has(p.marche)
			) {
				journal.nonCotes.add(p.fixtureId);
			}
		}
		return journal;
	} catch {
		return journal; // panne = repli silencieux, jamais de crash à la validation
	} finally {
		await jdb.flush(); // UNE insertion, tout le journal (appels + abandons)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION — matchs NON RÉSOLUS (le match n'est pas encore en base du tout).
//
// Cas distinct : ici le fixture N'EXISTE PAS — les deux équipes sont reconnues mais
// aucun match ne les oppose en base (trou de fraîcheur ≤ 6 h). On déclenche l'appel
// LIGUE seulement si les DEUX équipes sont reconnues et partagent une ligue du
// catalogue ; si le fournisseur porte la paire, on CRÉE le fixture, on écrit les
// probas, et on RE-RÉSOUT via `resolveTicket`. Sinon : « pas encore coté ».
// Mêmes garde-fous : budget PARTAGÉ, dédup, disjoncteur, journal des abandons.
// ═══════════════════════════════════════════════════════════════════════════

interface CibleNonResolue {
	selection: Selection;
	home: Team;
	away: Team;
	leagueId: number;
}

export interface ResultatNonResolus {
	selections: Selection[];
	journal: JournalOndemand;
}

/** league_id → clé The Odds API (via leagues.provider_ref = fd_code → league_catalog). */
async function sportKeysForLeagues(leagueIds: number[]): Promise<Map<number, string>> {
	const out = new Map<number, string>();
	if (leagueIds.length === 0) return out;
	const admin = supabaseAdmin();
	const { data: lg } = await admin.from('leagues').select('id, provider_ref').in('id', leagueIds);
	const fdByLeague = new Map<number, string>();
	for (const l of (lg ?? []) as { id: number; provider_ref: string | null }[])
		if (l.provider_ref) fdByLeague.set(l.id, l.provider_ref);
	const fdCodes = [...new Set([...fdByLeague.values()])];
	if (fdCodes.length === 0) return out;
	const { data: cat } = await admin
		.from('league_catalog')
		.select('fd_code, odds_api_key')
		.in('fd_code', fdCodes);
	const keyByFd = new Map<string, string>();
	for (const c of (cat ?? []) as { fd_code: string; odds_api_key: string }[])
		keyByFd.set(c.fd_code, c.odds_api_key);
	for (const [leagueId, fd] of fdByLeague) {
		const key = keyByFd.get(fd);
		if (key) out.set(leagueId, key);
	}
	return out;
}

/** L'événement de la ligue qui oppose EXACTEMENT nos deux équipes (peu importe l'ordre),
 *  avec le côté LU SUR LA DONNÉE (home/away de l'événement). null si absent. Exporté
 *  pour le test (logique pure). */
export function trouverEvenement(
	evenements: EvenementCotes[],
	home: Team,
	away: Team,
	teams: Team[]
): { ev: EvenementCotes; homeTeam: Team; awayTeam: Team } | null {
	const cible = new Set([home.id, away.id]);
	for (const ev of evenements) {
		const { home: evH, away: evA } = reconnaitreEquipes(`${ev.home} – ${ev.away}`, teams);
		if (!evH || !evA || evH.id === evA.id) continue;
		if (cible.has(evH.id) && cible.has(evA.id)) {
			return { ev, homeTeam: evH, awayTeam: evA };
		}
	}
	return null;
}

/** Crée (ou retrouve) le fixture d'un événement fournisseur. Renvoie son id, ou null. */
async function upsertFixture(
	eventId: string,
	homeId: number,
	awayId: number,
	leagueId: number,
	dateUtc: string
): Promise<number | null> {
	// On NE met PAS `statut` dans le payload : à l'insert la colonne prend son défaut
	// (`scheduled`, migration 0001) ; sur conflit, Supabase ne met à jour que les colonnes
	// FOURNIES, donc un fixture déjà `finished` GARDE son statut. Le forcer à `scheduled`
	// serait le gel à l'envers (« dé-terminer » un match joué) — même famille de bug que
	// l'orientation gelée dans les upserts fixtures (voir README, règle des upserts).
	const { data, error } = await supabaseAdmin()
		.from('fixtures')
		.upsert(
			{
				provider_ref: eventId,
				date_utc: dateUtc,
				team_home_id: homeId,
				team_away_id: awayId,
				league_id: leagueId
			},
			{ onConflict: 'provider_ref' }
		)
		.select('id')
		.limit(1);
	if (error) return null;
	const id = (data?.[0] as { id: number } | undefined)?.id;
	return id != null ? Number(id) : null;
}

/**
 * Comble les lignes NON RÉSOLUES d'un ticket. Renvoie les sélections mises à jour
 * (re-résolues si le match a pu être créé, sinon marquées `non_cote`). `budget` est
 * partagé avec la passe « cotes manquantes ». Appelé DANS le chemin d'écriture.
 * Ne lève jamais.
 */
export async function remplirMatchsNonResolus(
	selections: Selection[],
	teams: Team[],
	fixtures: Fixture[],
	budget: Budget = nouveauBudget(),
	phase: PhaseOndemand = 'finaliser'
): Promise<ResultatNonResolus> {
	const journal = journalVide();
	const inchange: ResultatNonResolus = { selections, journal };
	if (!providerConfigured() || !isSupabaseConfigured()) return inchange;
	const jdb = creerJournalDb(phase);
	try {
		// Candidates : ligne non_resolu, DEUX équipes reconnues, MÊME ligue.
		const cibles: CibleNonResolue[] = [];
		for (const s of selections) {
			if (s.raison !== 'non_resolu' || s.fixtureId !== null) continue;
			const { home, away } = reconnaitreEquipes(s.matchLabel, teams);
			if (!home || !away || home.id === away.id) continue;
			if (home.leagueId !== away.leagueId) continue; // pas de ligue commune → on n'appelle pas
			cibles.push({ selection: s, home, away, leagueId: home.leagueId });
		}
		if (cibles.length === 0) return inchange;
		if (await circuitOuvert()) return inchange;

		const sportByLeague = await sportKeysForLeagues([...new Set(cibles.map((c) => c.leagueId))]);
		for (const c of cibles)
			if (!sportByLeague.has(c.leagueId)) jdb.skip(`fx:${c.selection.ordre}`, 'ligue_non_mappee');
		const actifs = cibles.filter((c) => sportByLeague.has(c.leagueId));
		if (actifs.length === 0) return inchange;

		const jour = new Date().toISOString().slice(0, 10);

		const parLigue = new Map<string, CibleNonResolue[]>();
		for (const c of actifs) {
			const key = sportByLeague.get(c.leagueId)!;
			const liste = parLigue.get(key) ?? [];
			liste.push(c);
			parLigue.set(key, liste);
		}

		const crees: { selection: Selection; fixture: Fixture; cotes: EvenementCotes['cotes'] }[] = [];
		const nonCotes = new Set<number>(); // ordre des lignes interrogées mais non portées

		const appelLigue = async (sportKey: string, membres: CibleNonResolue[]) => {
			const cle = `od:lg:${sportKey}`;
			if (budget.restant() < MARGE_MS) {
				for (const m of membres) jdb.skip(cle, 'budget');
				return;
			}
			if (!(await revendiquer(cle))) {
				for (const m of membres) jdb.skip(cle, 'dedup');
				return;
			}
			try {
				const { evenements, credits } = await fetchLeagueOdds(sportKey, budget.restant());
				journal.credits += credits;
				journal.appels++;
				let ecrits = 0;
				for (const m of membres) {
					const trouve = trouverEvenement(evenements, m.home, m.away, teams);
					if (!trouve || !trouve.ev.commenceIso) {
						nonCotes.add(m.selection.ordre); // le fournisseur ne porte pas ce match
						jdb.skip(cle, 'non_apparie');
						continue;
					}
					const id = await upsertFixture(
						trouve.ev.eventId,
						trouve.homeTeam.id,
						trouve.awayTeam.id,
						m.leagueId,
						trouve.ev.commenceIso
					);
					if (!id) continue;
					crees.push({
						selection: m.selection,
						fixture: {
							id,
							dateUtc: trouve.ev.commenceIso,
							teamHome: trouve.homeTeam.nom,
							teamAway: trouve.awayTeam.nom,
							teamHomeId: trouve.homeTeam.id,
							teamAwayId: trouve.awayTeam.id,
							leagueId: m.leagueId,
							statut: 'scheduled',
							scoreHome: null,
							scoreAway: null
						},
						cotes: trouve.ev.cotes
					});
					ecrits++;
				}
				jdb.appel(cle, 'league', true, credits, ecrits);
			} catch (e) {
				jdb.appel(cle, 'league', false, 0, 0, String(e));
			}
		};

		const groupes = [...parLigue.entries()];
		for (let i = 0; i < groupes.length; i += CONCURRENCE) {
			if (budget.restant() < MARGE_MS) {
				for (const [sk, ms] of groupes.slice(i)) for (const m of ms) jdb.skip(`od:lg:${sk}`, 'budget');
				break;
			}
			await Promise.all(groupes.slice(i, i + CONCURRENCE).map(([sk, ms]) => appelLigue(sk, ms)));
		}

		// Écrire les probas dé-vigées des matchs créés.
		const lignes = crees.flatMap((c) => versLignes(c.fixture.id, jour, devigMarches(c.cotes)));
		journal.ecrits = await ecrirePredictions(lignes);

		// RE-RÉSOLUTION des seules lignes créées : on réutilise `resolveTicket` avec les
		// fixtures augmentés. On reconstruit le brut depuis `texteBrut`, on remet l'ordre.
		let selectionsMaj = selections;
		if (crees.length > 0) {
			const fixturesAug = [...fixtures, ...crees.map((c) => c.fixture)];
			const reref = resolveTicket(
				{ lignes: crees.map((c) => ({ texteBrut: c.selection.texteBrut })) },
				fixturesAug,
				teams
			);
			const parOrdre = new Map<number, Selection>();
			crees.forEach((c, i) => {
				const r = reref[i];
				if (r) parOrdre.set(c.selection.ordre, { ...r, ordre: c.selection.ordre });
			});
			selectionsMaj = selectionsMaj.map((s) => parOrdre.get(s.ordre) ?? s);
		}

		// Interrogé mais non porté par le fournisseur → « Ce match n'est pas encore coté. »
		if (nonCotes.size > 0) {
			selectionsMaj = selectionsMaj.map((s) =>
				nonCotes.has(s.ordre) && s.fixtureId === null ? { ...s, raison: 'non_cote' as const } : s
			);
		}
		return { selections: selectionsMaj, journal };
	} catch {
		return inchange; // panne = repli silencieux, jamais de crash à la validation
	} finally {
		await jdb.flush();
	}
}
