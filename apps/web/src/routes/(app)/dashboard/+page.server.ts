import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { hasRecharged } from '$lib/server/fixtures/userStore';
import { listAnalysedTickets } from '$lib/server/fixtures/ticketStore';
import { sports, predictions } from '$lib/server/services';
import { marketLabelFr } from '$lib/server/domain/market-map';
import { creditCost } from '$lib/server/domain/ticket';

export interface TicketCardVM {
	id: string;
	dateMs: number;
	nbMatchs: number;
	nbFragiles: number;
}

export interface DailyMatch {
	matchLabel: string;
	dateMs: number;
	marche: string;
	probabilitePct: number;
	/** Cote « proposée » (juste), déduite de la probabilité pour l'affichage. */
	coteProposee: number;
}

export interface Bilan {
	ticketsAnalyses: number;
	fragilesMarques: number;
	tombes: number;
}

export const load: PageServerLoad = async (event) => {
	// Le dashboard est la maison du connecté : sans session, retour à l'accueil.
	const session = await getAppSession(event);
	if (!session) redirect(303, '/');

	// Zone 2 — Analyse du matin : un match gratuit, marché le plus probable.
	const fixtures = await sports.upcomingFixtures();
	let daily: DailyMatch | null = null;
	if (fixtures.length > 0) {
		const f = fixtures[0];
		const preds = await predictions.forFixture(f.id);
		const best = preds.reduce((a, b) => (b.probabilite > a.probabilite ? b : a));
		daily = {
			matchLabel: `${f.teamHome} – ${f.teamAway}`,
			dateMs: Date.parse(f.dateUtc),
			marche: marketLabelFr(best.marche, f.teamHome, f.teamAway),
			probabilitePct: Math.round(best.probabilite * 100 * 10) / 10,
			coteProposee: Math.round((1 / best.probabilite) * 100) / 100
		};
	}

	// Zone 3 — Mes tickets.
	const tickets: TicketCardVM[] = (await listAnalysedTickets(session.userId)).map((t) => {
		const nbMatchs = t.selections.filter((s) => s.etatResolution === 'certain').length;
		return {
			id: t.id,
			dateMs: t.creeLeMs,
			nbMatchs,
			nbFragiles: t.result?.nbFragiles ?? 0
		};
	});

	// Zone 4 — Bilan (à partir de 3 tickets analysés).
	let bilan: Bilan | null = null;
	if (tickets.length >= 3) {
		const fragilesMarques = tickets.reduce((n, t) => n + t.nbFragiles, 0);
		bilan = { ticketsAnalyses: tickets.length, fragilesMarques, tombes: 0 };
	}

	// Encart premier passage : après le ticket offert, avant la première recharge.
	const dernier = tickets[0];
	const prochainCout = dernier ? (creditCost(dernier.nbMatchs) ?? 2) : 2;

	return {
		daily,
		tickets,
		bilan,
		premierPassage: session.premierTicketUtilise && !(await hasRecharged(session.userId)),
		// Le ticket d'essai est encore disponible tant que le premier n'a pas servi.
		ticketOffert: !session.premierTicketUtilise,
		prochainCout
	};
};
