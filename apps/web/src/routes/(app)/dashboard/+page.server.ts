import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { sports, predictions } from '$lib/server/services';
import { section } from '$lib/server/section';
import {
	choisirAnalyseDuJour,
	cleDuJour,
	joursDecart,
	type AnalyseDuJour,
	type CandidatJour
} from '$lib/server/domain/daily-analysis';
import type { Fixture, Market } from '$lib/types';
import {
	loadDashboardData,
	dashboardStats,
	ticketsEnCours,
	type DashboardStats,
	type TicketEnCours
} from '$lib/server/fixtures/dashboardStore';
import { listHistoryMarquee } from '$lib/server/fixtures/historyStore';
import { DEMO_MODE, demoStats, demoTicketsEnCours, demoHistoryItems } from '$lib/server/demo';

/** L'analyse offerte du jour, telle que la vue la reçoit. */
export type DailyMatch = AnalyseDuJour;

/**
 * Analyse du jour : DÉTERMINISTE (graine = jour civil local), choisie par intérêt.
 * On lit les probabilités des matchs de la fenêtre 48 h en UNE requête (forFixtures),
 * plus de boucle par match. Renvoie aussi le compteur « analysés en ce moment »
 * (matchs de la fenêtre ayant au moins une proba), sans requête supplémentaire.
 */
async function analyseDuJour(
	upcoming: Fixture[],
	jour: string
): Promise<{ daily: DailyMatch | null; analyseesEnCours: number }> {
	const fenetre = upcoming.filter((f) => {
		const d = joursDecart(jour, cleDuJour(Date.parse(f.dateUtc)));
		return d >= 0 && d <= 2;
	});
	const predsParMatch = await predictions.forFixtures(fenetre.map((f) => f.id));
	const candidats: CandidatJour[] = fenetre.map((f) => {
		const probas: Partial<Record<Market, number>> = {};
		for (const p of predsParMatch.get(f.id) ?? []) probas[p.marche] = p.probabilite;
		return { fixtureId: f.id, teamHome: f.teamHome, teamAway: f.teamAway, dateMs: Date.parse(f.dateUtc), probas };
	});
	const daily = choisirAnalyseDuJour(candidats, jour);
	const analyseesEnCours = candidats.filter((c) => Object.keys(c.probas).length > 0).length;
	return { daily, analyseesEnCours };
}

export const load: PageServerLoad = async (event) => {
	// Le +layout impose déjà la session (sinon redirection vers connexion).
	const session = (await getAppSession(event))!;
	const jour = cleDuJour(Date.now());

	// UNE lecture du calendrier à venir, partagée par l'analyse du jour ET les
	// tickets en cours (avant : lue deux fois). Isolée : si elle échoue, le reste
	// de la page s'affiche quand même (sections indépendantes).
	const upcoming = await section('upcoming', () => sports.upcomingFixtures(), [] as Fixture[]);

	// Quatre sections INDÉPENDANTES en parallèle. Chacune retombe sur un repli en cas
	// d'échec — une partie qui casse ne renvoie jamais une page d'erreur entière.
	const [analyse, dashData, histo] = await Promise.all([
		section('analyse-du-jour', () => analyseDuJour(upcoming, jour), {
			daily: null as DailyMatch | null,
			analyseesEnCours: 0
		}),
		section('dashboard-data', () => loadDashboardData(session.userId, upcoming), {
			analysed: [],
			upcoming,
			finished: [],
			datesReglables: new Map<number, number>()
		}),
		section('historique', () => listHistoryMarquee(40), [] as Awaited<ReturnType<typeof listHistoryMarquee>>)
	]);

	// Calculs PURS (aucune requête) sur les données déjà lues : ne lèvent pas.
	const stats: DashboardStats = dashboardStats(dashData);
	const enCours: TicketEnCours[] = ticketsEnCours(dashData);
	const { daily, analyseesEnCours } = analyse;

	// État « vue » : une fois consultée dans la journée, on n'affiche plus le
	// chiffre — on montre le prochain rendez-vous. Consulter = charger l'accueil.
	const dailyVue = event.cookies.get('mtj_daily') === jour;
	if (!dailyVue && daily) {
		event.cookies.set('mtj_daily', jour, {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 2
		});
	}

	// DÉMO (convention) : on garnit les vues pour les rendre dynamiques tant que
	// la base n'a pas de résultats réels. Voir lib/server/demo.ts (DEMO_MODE).
	const now = Date.now();
	const statsFinal = DEMO_MODE ? demoStats() : stats;
	const enCoursFinal = DEMO_MODE ? [...enCours, ...demoTicketsEnCours(now)] : enCours;
	const marquee = histo.length >= 20 ? histo : DEMO_MODE ? demoHistoryItems() : [];

	return {
		prenom: session.prenom,
		credits: session.credits,
		// Bêta : analyses offertes restantes, affichées à côté du solde de crédits.
		analysesOffertesRestantes: session.analysesOffertesRestantes,
		stats: statsFinal,
		daily,
		dailyVue,
		analyseesEnCours,
		ticketsEnCours: enCoursFinal,
		historique: marquee
	};
};
