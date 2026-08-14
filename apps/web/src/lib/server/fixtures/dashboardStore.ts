/**
 * dashboardStore.ts — Données de l'accueil du dashboard.
 *
 * On mesure la QUALITÉ de nos analyses, jamais les résultats de pari de
 * l'utilisateur (CLAUDE.md). D'où : tickets analysés, sélections marquées
 * fragiles, et combien de ces fragiles sont effectivement tombés. Aucun « ticket
 * gagné », aucun taux de réussite personnel, aucun gain.
 */
import { listAnalysedTickets } from './ticketStore';
import { settleMarket } from '$lib/server/domain/settle';
import { sports } from '$lib/server/services';
import type { Market } from '$lib/types';

export interface DashboardStats {
	ticketsAnalyses: number;
	fragilesMarques: number;
	/** Fragiles dont le match est terminé ET qui sont tombés. */
	fragilesTombes: number;
}

export interface TicketEnCours {
	id: string;
	dateMs: number;
	nbMatchs: number;
	/** Premier coup d'envoi connu, ou null si l'horaire n'est pas disponible. */
	kickoffMs: number | null;
}

/**
 * Statistiques d'accueil. `fragilesTombes` se règle contre les matchs terminés
 * (calcul déterministe) ; tant que le pipeline n'a pas de résultats, il vaut 0.
 */
export async function dashboardStats(userId: number): Promise<DashboardStats> {
	const analysed = await listAnalysedTickets(userId);
	const ticketsAnalyses = analysed.length;
	const fragilesMarques = analysed.reduce((n, t) => n + (t.result?.nbFragiles ?? 0), 0);

	// Matchs terminés connus, indexés par fixture.
	const finished = await sports.resultsSince(new Date(0).toISOString());
	const scoreOf = new Map<number, { h: number; a: number }>();
	for (const f of finished) {
		if (f.scoreHome != null && f.scoreAway != null) {
			scoreOf.set(f.id, { h: f.scoreHome, a: f.scoreAway });
		}
	}

	let fragilesTombes = 0;
	for (const t of analysed) {
		for (const s of t.selections) {
			if (!s.fragile || s.fixtureId === null || s.marche === null) continue;
			const sc = scoreOf.get(s.fixtureId);
			if (!sc) continue; // match non terminé : ni passé ni tombé
			const passe = settleMarket(s.marche as Market, sc.h, sc.a);
			if (passe === false) fragilesTombes += 1;
		}
	}

	return { ticketsAnalyses, fragilesMarques, fragilesTombes };
}

/**
 * Tickets dont au moins un match n'est pas terminé. Trié du plus proche coup
 * d'envoi au plus lointain quand l'horaire est connu.
 */
export async function ticketsEnCours(userId: number): Promise<TicketEnCours[]> {
	const [analysed, upcoming] = await Promise.all([
		listAnalysedTickets(userId),
		sports.upcomingFixtures()
	]);
	const dateOf = new Map<number, number>();
	for (const f of upcoming) dateOf.set(f.id, Date.parse(f.dateUtc));

	const finished = await sports.resultsSince(new Date(0).toISOString());
	const finishedIds = new Set(finished.map((f) => f.id));

	const out: TicketEnCours[] = [];
	for (const t of analysed) {
		const analysables = t.selections.filter((s) => s.etatResolution === 'certain');
		const fixtureIds = analysables.map((s) => s.fixtureId).filter((id): id is number => id !== null);
		const tousTermines = fixtureIds.length > 0 && fixtureIds.every((id) => finishedIds.has(id));
		if (tousTermines) continue; // ticket clos : il ira dans l'historique

		const horaires = fixtureIds.map((id) => dateOf.get(id)).filter((d): d is number => d != null);
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
