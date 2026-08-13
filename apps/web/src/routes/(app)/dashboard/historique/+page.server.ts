import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { listAnalysedTickets } from '$lib/server/fixtures/ticketStore';
import { settleMarket } from '$lib/server/fixtures/historyStore';
import { sports } from '$lib/server/services';
import { DEMO_MODE, demoHistoLignes } from '$lib/server/demo';
import type { Market } from '$lib/types';

export interface HistoLine {
	id: string;
	dateMs: number;
	nbMatchs: number;
	nbFragiles: number;
	statut: 'attente' | 'passe' | 'tombe';
	/** Premier coup d'envoi (état « en attente »). */
	kickoffMs: number | null;
	/** Match sur lequel le ticket est tombé (état « tombé »). */
	tombeSur: string | null;
	/** Vrai si la version renforcée serait passée alors que l'originale est tombée. */
	verdictRenforce: boolean;
}

export const load: PageServerLoad = async (event) => {
	const session = (await getAppSession(event))!;
	const [tickets, upcoming, finished] = await Promise.all([
		listAnalysedTickets(session.userId),
		sports.upcomingFixtures(),
		sports.resultsSince(new Date(0).toISOString())
	]);

	const dateOf = new Map<number, number>();
	for (const f of upcoming) dateOf.set(f.id, Date.parse(f.dateUtc));
	const scoreOf = new Map<number, { h: number; a: number }>();
	for (const f of finished) {
		if (f.scoreHome != null && f.scoreAway != null) scoreOf.set(f.id, { h: f.scoreHome, a: f.scoreAway });
	}

	const lignes: HistoLine[] = tickets.map((t) => {
		const analysables = t.selections.filter((s) => s.etatResolution === 'certain' && s.marche !== null);
		const nbMatchs = analysables.length;
		const nbFragiles = t.result?.nbFragiles ?? 0;

		// Tous les matchs sont-ils terminés ?
		const tousTermines =
			nbMatchs > 0 && analysables.every((s) => s.fixtureId !== null && scoreOf.has(s.fixtureId));

		if (!tousTermines) {
			const horaires = analysables
				.map((s) => (s.fixtureId != null ? dateOf.get(s.fixtureId) : undefined))
				.filter((d): d is number => d != null);
			return {
				id: t.id,
				dateMs: t.creeLeMs,
				nbMatchs,
				nbFragiles,
				statut: 'attente',
				kickoffMs: horaires.length ? Math.min(...horaires) : null,
				tombeSur: null,
				verdictRenforce: false
			};
		}

		// Règlement déterministe (calcul, jamais un LLM).
		const perdu = (s: (typeof analysables)[number]): boolean => {
			const sc = scoreOf.get(s.fixtureId as number)!;
			return settleMarket(s.marche as Market, sc.h, sc.a) === false;
		};
		const gardees = analysables.filter((s) => !s.retireeDuRenforce);
		const originalePasse = analysables.every((s) => !perdu(s));
		const renforcePasse = gardees.every((s) => !perdu(s));
		const premierPerdu = analysables.find((s) => perdu(s));

		return {
			id: t.id,
			dateMs: t.creeLeMs,
			nbMatchs,
			nbFragiles,
			statut: originalePasse ? 'passe' : 'tombe',
			kickoffMs: null,
			tombeSur: originalePasse ? null : (premierPerdu?.matchLabel ?? null),
			verdictRenforce: !originalePasse && renforcePasse
		};
	});

	// DÉMO (convention) : coupons fictifs pour voir la liste peuplée. Voir demo.ts.
	const toutes = DEMO_MODE ? [...lignes, ...demoHistoLignes(Date.now())] : lignes;
	return { lignes: toutes };
};
