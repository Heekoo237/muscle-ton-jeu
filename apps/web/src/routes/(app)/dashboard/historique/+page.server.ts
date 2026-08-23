import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { listAnalysedTickets } from '$lib/server/fixtures/ticketStore';
import {
	settleTicket,
	verdictAffiche,
	isSettleable,
	resultatIntrouvable,
	type FinalScore
} from '$lib/server/domain/settle';
import { sports } from '$lib/server/services';
import { DEMO_MODE, demoHistoLignes } from '$lib/server/demo';

export interface HistoLine {
	id: string;
	dateMs: number;
	nbMatchs: number;
	nbFragiles: number;
	/**
	 * `sans_reglement` : aucune sélection réglable — rien qu'un score puisse décider.
	 * `indisponible` : match(s) réglable(s) passé(s) depuis longtemps, score jamais arrivé.
	 */
	statut: 'attente' | 'passe' | 'tombe' | 'sans_reglement' | 'indisponible';
	/** Premier coup d'envoi (état « en attente »). */
	kickoffMs: number | null;
	/** Date à laquelle le ticket a été réglé (dernier match terminé), état passé/tombé. */
	verdictDateMs: number | null;
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

	// Dates connues des matchs : à venir (coups d'envoi) ET terminés (pour dater un
	// verdict). Un match réglé n'est plus dans `upcoming` — sans les terminés, on
	// n'aurait aucune date à afficher à côté du verdict.
	const dateOf = new Map<number, number>();
	for (const f of upcoming) dateOf.set(f.id, Date.parse(f.dateUtc));
	for (const f of finished) dateOf.set(f.id, Date.parse(f.dateUtc));
	// Dates des matchs réglables restés SANS score (scheduled, coup d'envoi passé) : ni
	// dans `upcoming` (à venir) ni dans `finished` (terminés). Sans elles, impossible de
	// dire qu'un résultat est « introuvable » (le score ne viendra jamais).
	const idsReglables = [
		...new Set(
			tickets.flatMap((t) => t.selections.filter(isSettleable).map((s) => s.fixtureId as number))
		)
	].filter((id) => !dateOf.has(id));
	if (idsReglables.length > 0) {
		const dates = await sports.fixtureDates(idsReglables);
		for (const [id, ms] of dates) dateOf.set(id, ms);
	}
	const scores = new Map<number, FinalScore>();
	for (const f of finished) {
		if (f.scoreHome != null && f.scoreAway != null)
			scores.set(f.id, { home: f.scoreHome, away: f.scoreAway, homeTeamId: f.teamHomeId });
	}

	const lignes: HistoLine[] = tickets.map((t) => {
		const analysables = t.selections.filter((s) => s.etatResolution === 'certain' && s.marche !== null);
		const nbMatchs = analysables.length;
		const nbFragiles = t.result?.nbFragiles ?? 0;

		// Recalcul en direct (repli) — sert au « tombé sur ce match » et à la fenêtre
		// ≤ 6 h avant le passage du cron. Déterministe (domain/settle), jamais un LLM.
		const v = settleTicket(t.selections, scores);

		// SOURCE DE VÉRITÉ : le verdict PERSISTÉ par le règlement. Le recalcul ne prime
		// jamais sur lui (règle d'archi n°2 : le temps réel lit). Il ne fait que combler
		// le trou avant que le cron n'ait posé le résultat.
		const statutV = verdictAffiche(t.resultatOriginale, v.originale);

		// Aucune sélection réglable → un score ne décidera JAMAIS ce ticket. On le sort
		// de la file « en attente » avec un statut honnête plutôt que de le faire patienter
		// pour un résultat qui ne viendra pas.
		if (statutV === 'en_attente' && t.selections.filter(isSettleable).length === 0) {
			return {
				id: t.id,
				dateMs: t.creeLeMs,
				nbMatchs,
				nbFragiles,
				statut: 'sans_reglement',
				kickoffMs: null,
				verdictDateMs: null,
				tombeSur: null,
				verdictRenforce: false
			};
		}

		if (statutV === 'en_attente') {
			const horairesReglables = t.selections
				.filter(isSettleable)
				.map((s) => dateOf.get(s.fixtureId as number))
				.filter((d): d is number => d != null);
			const dernierKickoff = horairesReglables.length ? Math.max(...horairesReglables) : null;

			// Dernier match réglable passé depuis longtemps, toujours sans score → le score
			// ne viendra jamais (hors fenêtre /scores). Statut honnête plutôt que « en attente ».
			if (resultatIntrouvable(dernierKickoff, Date.now())) {
				return {
					id: t.id,
					dateMs: t.creeLeMs,
					nbMatchs,
					nbFragiles,
					statut: 'indisponible',
					kickoffMs: null,
					verdictDateMs: dernierKickoff,
					tombeSur: null,
					verdictRenforce: false
				};
			}

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
				verdictDateMs: null,
				tombeSur: null,
				verdictRenforce: false
			};
		}

		const tombeSur =
			v.premierPerduOrdre != null
				? (t.selections.find((s) => s.ordre === v.premierPerduOrdre)?.matchLabel ?? null)
				: null;

		// Date du verdict = dernier match analysé terminé ; à défaut, l'instant d'analyse.
		const horaires = analysables
			.map((s) => (s.fixtureId != null ? dateOf.get(s.fixtureId) : undefined))
			.filter((d): d is number => d != null);
		const verdictDateMs = horaires.length ? Math.max(...horaires) : (t.analyseLeMs ?? t.creeLeMs);

		// Le renforcé a-t-il sauvé le ticket ? Verdict persisté prioritaire, repli recalcul.
		const verdictRenforce =
			t.resultatOriginale === 'tombe' && t.resultat === 'passe'
				? true
				: t.resultatOriginale == null && v.originale === 'tombe' && v.renforce === 'passe';

		return {
			id: t.id,
			dateMs: t.creeLeMs,
			nbMatchs,
			nbFragiles,
			statut: statutV === 'passe' ? 'passe' : 'tombe',
			kickoffMs: null,
			verdictDateMs,
			// La version renforcée aurait sauvé le ticket : l'original tombe, le renforcé passe.
			tombeSur: statutV === 'passe' ? null : tombeSur,
			verdictRenforce
		};
	});

	// DÉMO (convention) : tickets fictifs pour voir la liste peuplée. Voir demo.ts.
	const toutes = DEMO_MODE ? [...lignes, ...demoHistoLignes(Date.now())] : lignes;
	return { lignes: toutes };
};
