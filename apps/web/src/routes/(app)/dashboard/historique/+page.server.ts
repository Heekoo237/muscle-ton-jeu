import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { listAnalysedTickets } from '$lib/server/fixtures/ticketStore';
import { settleTicket, type FinalScore } from '$lib/server/domain/settle';
import { sports } from '$lib/server/services';
import { DEMO_MODE, demoHistoLignes } from '$lib/server/demo';

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
	const scores = new Map<number, FinalScore>();
	for (const f of finished) {
		if (f.scoreHome != null && f.scoreAway != null) scores.set(f.id, { home: f.scoreHome, away: f.scoreAway });
	}

	const lignes: HistoLine[] = tickets.map((t) => {
		const analysables = t.selections.filter((s) => s.etatResolution === 'certain' && s.marche !== null);
		const nbMatchs = analysables.length;
		const nbFragiles = t.result?.nbFragiles ?? 0;

		// Règlement déterministe UNIQUE (domain/settle), jamais un LLM.
		const v = settleTicket(t.selections, scores);

		if (v.originale === 'en_attente') {
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

		const tombeSur =
			v.premierPerduOrdre != null
				? (t.selections.find((s) => s.ordre === v.premierPerduOrdre)?.matchLabel ?? null)
				: null;

		return {
			id: t.id,
			dateMs: t.creeLeMs,
			nbMatchs,
			nbFragiles,
			statut: v.originale === 'passe' ? 'passe' : 'tombe',
			kickoffMs: null,
			// La version renforcée aurait sauvé le ticket : l'original tombe, le renforcé passe.
			tombeSur: v.originale === 'passe' ? null : tombeSur,
			verdictRenforce: v.originale === 'tombe' && v.renforce === 'passe'
		};
	});

	// DÉMO (convention) : tickets fictifs pour voir la liste peuplée. Voir demo.ts.
	const toutes = DEMO_MODE ? [...lignes, ...demoHistoLignes(Date.now())] : lignes;
	return { lignes: toutes };
};
