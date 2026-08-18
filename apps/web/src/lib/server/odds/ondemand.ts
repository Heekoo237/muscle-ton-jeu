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
 *  - Anti-clobber : on n'écrit QUE pour les matchs sans probabilité modèle — on ne
 *    rétrograde jamais une proba calibrée (comme l'intérim du collecteur).
 *  - Budget < 2 s : un délai DUR partagé (`DEADLINE_MS`) borne TOUS les appels ; ce
 *    qui n'arrive pas à temps retombe en silence sur « pas encore de données ».
 *  - Panne = repli SILENCIEUX : aucune exception ne remonte à l'appelant.
 *  - Dédup (ligue + récence) : 20 utilisateurs sur le même match paient une fois.
 *  - Disjoncteur : trop d'échecs récents → on CESSE d'appeler (repli collecteur seul).
 *  - Journal : chaque appel fournisseur est tracé (`ondemand_calls`) — crédits inclus.
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

/** Délai DUR partagé par tous les appels d'une validation. Jamais > 2 s côté user. */
const DEADLINE_MS = 1500;
/** Dédup : une même ligue (resp. un même événement) n'est ré-interrogée qu'après ce délai. */
const DEDUP_TTL_S = 900; // 15 min
/** Plafond d'appels PAR ÉVÉNEMENT (marchés additionnels) sur une même validation. */
const MAX_APPELS_EVENEMENT = 4;
/** Disjoncteur : fenêtre, minimum d'essais avant de conclure, seuil d'échec. */
const CIRCUIT = { fenetreS: 1800, minEssais: 8, seuil: 0.5 };
/** Confiance et seuil FIXES du régime cote seule (miroir de `constants.py`). */
const CONFIANCE_COTE_SEULE = 0.33; // CONFIDENCE_VALUE["faible"]
const SEUIL_FRAGILE_COTE_SEULE = 0.5; // FRAGILE_THRESHOLD_COTE_SEULE

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
	 * Fixtures pour lesquels on a bien INTERROGÉ le fournisseur mais qui n'ont AUCUNE
	 * cote dévigeable (le fournisseur ne price pas ce match) → message honnête
	 * « pas encore coté », distinct du transitoire « pas encore de données ».
	 */
	nonCotes: Set<number>;
}

const journalVide = (): JournalOndemand => ({ ecrits: 0, appels: 0, credits: 0, nonCotes: new Set() });

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

/** Disjoncteur ouvert ? (trop d'échecs récents). Fail-closed-safe : en cas de doute, fermé. */
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

/** Journalise un appel fournisseur (succès/échec, crédits, matchs écrits). Jamais bloquant. */
async function tracer(
	cle: string,
	kind: 'league' | 'event',
	ok: boolean,
	credits: number,
	matchsEcrits: number,
	erreur?: string
): Promise<void> {
	try {
		await supabaseAdmin().from('ondemand_calls').insert({
			cle,
			kind,
			ok,
			credits,
			matchs_ecrits: matchsEcrits,
			erreur: erreur ?? null
		});
	} catch {
		/* le journal ne doit jamais casser la validation */
	}
}

/** Cibles à combler : fixtures À VENIR, résolus, mappés à une clé fournisseur. */
async function chargerCibles(fixtureIds: number[]): Promise<Cible[]> {
	if (fixtureIds.length === 0) return [];
	const admin = supabaseAdmin();
	// 1) fixtures à venir avec provider_ref (event id) et league_id.
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
	// 2) leagues → fd_code (leagues.provider_ref), puis league_catalog → odds_api_key.
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

/** Nos fixtures À VENIR correspondant à des event ids fournisseur (provider_ref). */
async function fixturesParRef(refs: string[]): Promise<{ fixtureId: number; providerRef: string }[]> {
	if (refs.length === 0) return [];
	const nowIso = new Date().toISOString();
	const { data } = await supabaseAdmin()
		.from('fixtures')
		.select('id, provider_ref, date_utc, statut')
		.in('provider_ref', refs);
	return ((data ?? []) as {
		id: number;
		provider_ref: string | null;
		date_utc: string;
		statut: string;
	}[])
		.filter((r) => r.provider_ref && r.statut === 'scheduled' && r.date_utc > nowIso)
		.map((r) => ({ fixtureId: r.id, providerRef: r.provider_ref as string }));
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

/**
 * Comble les probabilités manquantes des `fixtureIds` donnés. Appelé DANS le chemin
 * d'écriture (validation), jamais dans la lecture temps réel. Ne lève jamais.
 */
export async function remplirCotesManquantes(fixtureIds: number[]): Promise<JournalOndemand> {
	const journal = journalVide();
	if (!providerConfigured() || !isSupabaseConfigured()) return journal;
	try {
		if (await circuitOuvert()) return journal; // repli collecteur seul (surveillance alerte)

		const cibles = await chargerCibles(fixtureIds);
		if (cibles.length === 0) return journal;

		// Ne combler que les matchs SANS probabilité modèle (anti-clobber). On lit les
		// prédictions existantes : un fixture déjà couvert (modèle) n'est pas une cible.
		const uniqIds = [...new Set(cibles.map((c) => c.fixtureId))];
		const dejaConnu = await predictions.forFixtures(uniqIds);
		const MODELE = new Set(['odds', 'model', 'repli', 'model_marge_excessive']);
		const marchesConnus = (fid: number) => new Set((dejaConnu.get(fid) ?? []).map((p) => p.marche));
		const aProbaModele = (fid: number) =>
			(dejaConnu.get(fid) ?? []).some((p) => p.source && MODELE.has(p.source));
		const aCombler = cibles.filter((c) => !aProbaModele(c.fixtureId));
		if (aCombler.length === 0) return journal;

		const t0 = Date.now();
		const restant = () => Math.max(0, DEADLINE_MS - (Date.now() - t0));
		const jour = new Date().toISOString().slice(0, 10);
		const lignes: ReturnType<typeof versLignes> = [];

		// ── 1) Appel par LIGUE (comble 1X2 + plus/moins 2,5 de TOUS ses matchs ciblés) ──
		const parLigue = new Map<string, Cible[]>();
		for (const c of aCombler) {
			const liste = parLigue.get(c.sportKey) ?? [];
			liste.push(c);
			parLigue.set(c.sportKey, liste);
		}
		const interrogees = new Set<number>(); // fixtures dont la ligue a répondu

		for (const [sportKey, membres] of parLigue) {
			if (restant() < 200) break; // plus de budget : on s'arrête proprement
			if (!(await revendiquer(`od:lg:${sportKey}`))) continue; // déjà comblé récemment
			const cle = `od:lg:${sportKey}`;
			try {
				const { evenements, credits } = await fetchLeagueOdds(sportKey, restant());
				journal.appels++;
				journal.credits += credits;
				// La ligue a répondu : ses matchs du ticket courant sont « interrogés »
				// (pour trancher ensuite « pas encore coté » vs « pas encore de données »).
				for (const m of membres) interrogees.add(m.fixtureId);
				// L'appel ligue (2 crédits) rapporte TOUS les matchs de la ligue : on
				// comble d'un coup CHACUN de nos matchs à venir qui correspond (par
				// provider_ref) et n'a pas de proba modèle — pas seulement ceux du ticket
				// courant. Un prochain ticket sur cette ligue trouvera déjà la donnée.
				const parRef = new Map<string, EvenementCotes>(evenements.map((e) => [e.eventId, e]));
				const notres = await fixturesParRef([...parRef.keys()]);
				const idsNouveaux = notres.map((f) => f.fixtureId).filter((id) => !dejaConnu.has(id));
				if (idsNouveaux.length > 0) {
					const sup = await predictions.forFixtures(idsNouveaux);
					for (const [id, ps] of sup) dejaConnu.set(id, ps);
				}
				let ecrits = 0;
				for (const f of notres) {
					if (aProbaModele(f.fixtureId)) continue; // anti-clobber : jamais sur du modèle
					const ev = parRef.get(f.providerRef);
					if (!ev) continue;
					const connus = marchesConnus(f.fixtureId);
					const nouv = devigMarches(ev.cotes).filter((p) => !connus.has(p.marche));
					const l = versLignes(f.fixtureId, jour, nouv);
					lignes.push(...l);
					ecrits += l.length;
				}
				await tracer(cle, 'league', true, credits, ecrits);
			} catch (e) {
				await tracer(cle, 'league', false, 0, 0, String(e));
			}
		}

		// ── 2) Marchés ADDITIONNELS par événement (BTTS, plus/moins 1,5 et 3,5) ──
		let appelsEvenement = 0;
		for (const c of aCombler) {
			if (appelsEvenement >= MAX_APPELS_EVENEMENT || restant() < 200) break;
			if (!(await revendiquer(`od:ev:${c.providerRef}`))) continue;
			const cle = `od:ev:${c.providerRef}`;
			try {
				const { evenement, credits } = await fetchEventExtras(c.sportKey, c.providerRef, restant());
				journal.appels++;
				appelsEvenement++;
				journal.credits += credits;
				interrogees.add(c.fixtureId);
				let ecrits = 0;
				if (evenement) {
					const connus = marchesConnus(c.fixtureId);
					const nouv = devigMarches(evenement.cotes).filter((p) => !connus.has(p.marche));
					const l = versLignes(c.fixtureId, jour, nouv);
					lignes.push(...l);
					ecrits += l.length;
				}
				await tracer(cle, 'event', true, credits, ecrits);
			} catch (e) {
				await tracer(cle, 'event', false, 0, 0, String(e));
			}
		}

		// ── 3) Écriture unique (upsert idempotent sur la clé du jour) ──
		if (lignes.length > 0) {
			const { error } = await supabaseAdmin()
				.from('predictions')
				.upsert(lignes, { onConflict: 'fixture_id,marche,jour_calcul' });
			if (!error) journal.ecrits = lignes.length;
		}

		// ── 4) « Pas encore coté » : interrogé, mais toujours aucune proba écrite ──
		const ecritsParFixture = new Set(lignes.map((l) => l.fixture_id));
		for (const c of aCombler) {
			if (interrogees.has(c.fixtureId) && !ecritsParFixture.has(c.fixtureId)) {
				// Le fournisseur a répondu pour la ligue mais ne price pas ce match.
				if (!marchesConnus(c.fixtureId).size) journal.nonCotes.add(c.fixtureId);
			}
		}
		return journal;
	} catch {
		return journal; // panne = repli silencieux, jamais de crash à la validation
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION — matchs NON RÉSOLUS (le match n'est pas encore en base du tout).
//
// Cas distinct de `remplirCotesManquantes` : là, le fixture EXISTE mais n'a pas de
// proba. Ici, le fixture N'EXISTE PAS — les deux équipes sont reconnues mais aucun
// match ne les oppose en base (le collecteur ne l'a pas encore relevé : trou de
// fraîcheur ≤ 6 h — le joueur compose samedi matin un match de l'après-midi). Pour
// l'utilisateur c'est le même problème : son bookmaker affiche le match, nous non.
//
// On déclenche l'appel LIGUE (exigence a : seulement si les DEUX équipes sont
// reconnues et partagent une ligue du catalogue), même dédup (b), même délai dur
// (c). Si le fournisseur porte la paire : on CRÉE le fixture, on écrit les probas
// dé-vigées, et on RE-RÉSOUT via `resolveTicket` (on ne réimplémente pas la
// résolution — on fait juste EXISTER le match qui manquait). Sinon : message
// honnête « pas encore coté » (jamais « on n'a pas retrouvé ce match »).
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
			// Le côté vient de l'ÉVÉNEMENT (donnée), jamais de l'ordre du ticket.
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
	const { data, error } = await supabaseAdmin()
		.from('fixtures')
		.upsert(
			{
				provider_ref: eventId,
				date_utc: dateUtc,
				team_home_id: homeId,
				team_away_id: awayId,
				league_id: leagueId,
				statut: 'scheduled'
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
 * Comble les lignes NON RÉSOLUES d'un ticket : les deux équipes reconnues mais aucun
 * match en base. Renvoie les sélections mises à jour (re-résolues si le match a pu
 * être créé, sinon marquées `non_cote`). Appelé DANS le chemin d'écriture (validation).
 * Ne lève jamais.
 */
export async function remplirMatchsNonResolus(
	selections: Selection[],
	teams: Team[],
	fixtures: Fixture[]
): Promise<ResultatNonResolus> {
	const journal = journalVide();
	const inchange: ResultatNonResolus = { selections, journal };
	if (!providerConfigured() || !isSupabaseConfigured()) return inchange;
	try {
		// (a) Candidates : ligne non_resolu, DEUX équipes reconnues, MÊME ligue.
		const cibles: CibleNonResolue[] = [];
		for (const s of selections) {
			if (s.raison !== 'non_resolu' || s.fixtureId !== null) continue;
			const { home, away } = reconnaitreEquipes(s.matchLabel, teams);
			if (!home || !away || home.id === away.id) continue;
			if (home.leagueId !== away.leagueId) continue; // pas de ligue commune → on n'appelle pas
			cibles.push({ selection: s, home, away, leagueId: home.leagueId });
		}
		if (cibles.length === 0) return inchange;

		if (await circuitOuvert()) return inchange; // repli collecteur seul

		// Ligue → clé fournisseur (catalogue). Sans clé : pas d'appel.
		const sportByLeague = await sportKeysForLeagues([...new Set(cibles.map((c) => c.leagueId))]);
		const actifs = cibles.filter((c) => sportByLeague.has(c.leagueId));
		if (actifs.length === 0) return inchange;

		const t0 = Date.now();
		const restant = () => Math.max(0, DEADLINE_MS - (Date.now() - t0));
		const jour = new Date().toISOString().slice(0, 10);

		// Par LIGUE : un seul appel (b, dédup partagée avec `remplirCotesManquantes`).
		const parLigue = new Map<string, CibleNonResolue[]>();
		for (const c of actifs) {
			const key = sportByLeague.get(c.leagueId)!;
			const liste = parLigue.get(key) ?? [];
			liste.push(c);
			parLigue.set(key, liste);
		}

		const crees: { selection: Selection; fixture: Fixture; cotes: EvenementCotes['cotes'] }[] = [];
		const nonCotes = new Set<number>(); // ordre des lignes interrogées mais non portées

		for (const [sportKey, membres] of parLigue) {
			if (restant() < 200) break;
			if (!(await revendiquer(`od:lg:${sportKey}`))) continue; // déjà interrogée récemment
			const cle = `od:lg:${sportKey}`;
			try {
				const { evenements, credits } = await fetchLeagueOdds(sportKey, restant());
				journal.appels++;
				journal.credits += credits;
				let ecrits = 0;
				for (const m of membres) {
					const trouve = trouverEvenement(evenements, m.home, m.away, teams);
					if (!trouve || !trouve.ev.commenceIso) {
						nonCotes.add(m.selection.ordre); // le fournisseur ne porte pas ce match
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
							leagueId: m.leagueId,
							statut: 'scheduled',
							scoreHome: null,
							scoreAway: null
						},
						cotes: trouve.ev.cotes
					});
					ecrits++;
				}
				await tracer(cle, 'league', true, credits, ecrits);
			} catch (e) {
				await tracer(cle, 'league', false, 0, 0, String(e));
			}
		}

		// Écrire les probas dé-vigées des matchs créés.
		const lignes = crees.flatMap((c) => versLignes(c.fixture.id, jour, devigMarches(c.cotes)));
		if (lignes.length > 0) {
			const { error } = await supabaseAdmin()
				.from('predictions')
				.upsert(lignes, { onConflict: 'fixture_id,marche,jour_calcul' });
			if (!error) journal.ecrits = lignes.length;
		}

		// RE-RÉSOLUTION des seules lignes créées : on réutilise `resolveTicket` avec les
		// fixtures augmentés (le match existe désormais). On reconstruit le brut depuis
		// `texteBrut` (ligne complète « Match  Marché  Cote »), on remet l'ordre d'origine.
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
	}
}
