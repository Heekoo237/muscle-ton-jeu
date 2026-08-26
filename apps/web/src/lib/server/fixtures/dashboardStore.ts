/**
 * dashboardStore.ts — Données de l'accueil du dashboard.
 *
 * On mesure la QUALITÉ de nos analyses, jamais les résultats de pari de
 * l'utilisateur (CLAUDE.md). D'où : tickets analysés, sélections marquées
 * fragiles, et combien de ces fragiles sont effectivement tombés. Aucun « ticket
 * gagné », aucun taux de réussite personnel, aucun gain.
 */
import { listAnalysedTickets, type StoredTicket } from './ticketStore';
import {
	selectionOutcome,
	isSettleable,
	resultatIntrouvable,
	type FinalScore
} from '$lib/server/domain/settle';
import { sports } from '$lib/server/services';
import { MATCH_DUREE_MS } from '$lib/server/domain/window';
import type { Fixture, Market } from '$lib/types';

export interface DashboardStats {
	ticketsAnalyses: number;
	fragilesMarques: number;
	/** Fragiles dont le match est terminé ET qui sont tombés. */
	fragilesTombes: number;
	/** Répartition des tickets analysés : réglés (verdict connu) vs en attente. */
	ticketsRegles: number;
	ticketsEnAttente: number;
}

export interface TicketEnCours {
	id: string;
	dateMs: number;
	nbMatchs: number;
	/** Premier coup d'envoi connu, ou null si l'horaire n'est pas disponible. */
	kickoffMs: number | null;
}

/**
 * Charge UNE FOIS les données partagées de l'accueil : tickets analysés de
 * l'utilisateur, calendrier à venir, matchs terminés. Avant, `dashboardStats` et
 * `ticketsEnCours` relisaient chacun ces mêmes tables (tickets ×2, à venir ×2,
 * terminés ×2). On lit ici en parallèle, une seule fois, et les fonctions de
 * calcul deviennent PURES (aucune requête).
 */
export interface DashboardData {
	analysed: StoredTicket[];
	upcoming: Fixture[];
	finished: Fixture[];
	/** Dates (ms) des matchs réglables — inclut ceux restés sans score (indisponibles). */
	datesReglables: Map<number, number>;
}
export async function loadDashboardData(userId: number, upcoming: Fixture[]): Promise<DashboardData> {
	const [analysed, finished] = await Promise.all([
		listAnalysedTickets(userId),
		sports.resultsSince(new Date(0).toISOString())
	]);
	// Dates des matchs réglables (pour distinguer « en attente » de « introuvable »).
	const ids = [
		...new Set(analysed.flatMap((t) => t.selections.filter(isSettleable).map((s) => s.fixtureId as number)))
	];
	const datesReglables = await sports.fixtureDates(ids);
	return { analysed, upcoming, finished, datesReglables };
}

/**
 * Statistiques d'accueil. `fragilesTombes` se règle contre les matchs terminés
 * (calcul déterministe) ; tant que le pipeline n'a pas de résultats, il vaut 0.
 * PURE : reçoit les données déjà lues (voir loadDashboardData).
 */
export function dashboardStats(data: DashboardData): DashboardStats {
	const { analysed, finished } = data;
	const ticketsAnalyses = analysed.length;
	const fragilesMarques = analysed.reduce((n, t) => n + (t.result?.nbFragiles ?? 0), 0);

	// Matchs terminés connus, indexés par fixture. On garde l'orientation courante
	// (homeTeamId) pour que le règlement se recale sur le snapshot de la sélection.
	const scoreOf = new Map<number, FinalScore>();
	for (const f of finished) {
		if (f.scoreHome != null && f.scoreAway != null) {
			scoreOf.set(f.id, { home: f.scoreHome, away: f.scoreAway, homeTeamId: f.teamHomeId });
		}
	}

	let fragilesTombes = 0;
	for (const t of analysed) {
		for (const s of t.selections) {
			if (!s.fragile || s.fixtureId === null || s.marche === null) continue;
			const sc = scoreOf.get(s.fixtureId);
			if (!sc) continue; // match non terminé : ni passé ni tombé
			const passe = selectionOutcome(s, sc);
			if (passe === false) fragilesTombes += 1;
		}
	}

	// Répartition réglés / en attente. Un ticket est RÉGLÉ dès que le cron a posé son
	// verdict (source de vérité) ; à défaut, si tous ses matchs réglables sont terminés
	// (repli avant le passage du cron). On ne compte que les tickets qui PEUVENT être
	// réglés (au moins un match réglable) — sinon ni réglé ni en attente.
	const finishedIds = new Set(finished.map((f) => f.id));
	const { datesReglables } = data;
	const nowMs = Date.now();
	let ticketsRegles = 0;
	let ticketsEnAttente = 0;
	for (const t of analysed) {
		const regleStocke = t.resultatOriginale === 'passe' || t.resultatOriginale === 'tombe';
		const reglables = t.selections.filter(isSettleable);
		if (reglables.length === 0 && !regleStocke) continue; // rien à régler : hors compte
		const tousTermines = reglables.length > 0 && reglables.every((s) => finishedIds.has(s.fixtureId as number));
		if (regleStocke || tousTermines) {
			ticketsRegles += 1;
			continue;
		}
		// Résultat introuvable (dernier match passé depuis > 5 j, sans score) : ne se
		// réglera jamais → ni réglé ni « en attente » (ne pas gonfler l'attente à vie).
		const kicks = reglables.map((s) => datesReglables.get(s.fixtureId as number)).filter((d): d is number => d != null);
		const dernier = kicks.length ? Math.max(...kicks) : null;
		if (resultatIntrouvable(dernier, nowMs)) continue;
		ticketsEnAttente += 1;
	}

	return { ticketsAnalyses, fragilesMarques, fragilesTombes, ticketsRegles, ticketsEnAttente };
}

/**
 * Tickets dont au moins un match n'est pas terminé. Trié du plus proche coup
 * d'envoi au plus lointain quand l'horaire est connu. PURE : reçoit les données
 * déjà lues (voir loadDashboardData).
 */
export function ticketsEnCours(data: DashboardData): TicketEnCours[] {
	const { analysed, upcoming, finished, datesReglables } = data;
	// Dates de coup d'envoi, toutes sources confondues : terminés + réglables (passés,
	// sans score) + à venir. Le plus « frais » (à venir) écrit en dernier. Sans les
	// matchs passés ici, un ticket joué mais non réglé n'aurait aucune date connue et
	// resterait « en cours » à vie.
	const dateOf = new Map<number, number>();
	for (const f of finished) dateOf.set(f.id, Date.parse(f.dateUtc));
	for (const [id, ms] of datesReglables) dateOf.set(id, ms);
	for (const f of upcoming) dateOf.set(f.id, Date.parse(f.dateUtc));

	const finishedIds = new Set(finished.map((f) => f.id));
	const now = Date.now();

	const out: TicketEnCours[] = [];
	for (const t of analysed) {
		const analysables = t.selections.filter((s) => s.etatResolution === 'certain');
		const fixtureIds = analysables.map((s) => s.fixtureId).filter((id): id is number => id !== null);
		if (fixtureIds.length === 0) continue;
		const tousTermines = fixtureIds.every((id) => finishedIds.has(id));
		// « Joué » à l'heure : tous les coups d'envoi connus ET passés depuis la durée d'un
		// match. Un ticket joué QUITTE « en cours » (même sans score encore) — il apparaît
		// dans l'historique en « Terminé », au lieu de traîner ici en « En attente ».
		const horairesTous = fixtureIds.map((id) => dateOf.get(id));
		const tousJoues = horairesTous.every((ms) => ms != null && ms + MATCH_DUREE_MS < now);
		if (tousTermines || tousJoues) continue; // ticket clos : il ira dans l'historique

		const horaires = horairesTous.filter((d): d is number => d != null);
		out.push({
			id: t.id,
			dateMs: t.creeLeMs,
			nbMatchs: analysables.length,
			kickoffMs: horaires.length ? Math.min(...horaires) : null
		});
	}
	// Plus proche coup d'envoi d'abord (les sans-horaire en fin).
	out.sort((a, b) => (a.kickoffMs ?? Infinity) - (b.kickoffMs ?? Infinity));
	return out;
}
