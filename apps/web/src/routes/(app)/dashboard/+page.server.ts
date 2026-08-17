import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { sports, predictions } from '$lib/server/services';
import {
	choisirAnalyseDuJour,
	cleDuJour,
	joursDecart,
	type AnalyseDuJour,
	type CandidatJour
} from '$lib/server/domain/daily-analysis';
import type { Market } from '$lib/types';
import { dashboardStats, ticketsEnCours } from '$lib/server/fixtures/dashboardStore';
import { listHistoryMarquee } from '$lib/server/fixtures/historyStore';
import { DEMO_MODE, demoStats, demoTicketsEnCours, demoHistoryItems } from '$lib/server/demo';

/** L'analyse offerte du jour, telle que la vue la reçoit. */
export type DailyMatch = AnalyseDuJour;

export const load: PageServerLoad = async (event) => {
	// Le +layout impose déjà la session (sinon redirection vers connexion).
	const session = (await getAppSession(event))!;

	// Analyse du jour : DÉTERMINISTE, graine = le jour civil local. Le même jour,
	// tout le monde voit la même lecture, figée. On la choisit par intérêt (jamais
	// « la proba la plus haute », qui donnait toujours une double chance). PRIORITÉ AU
	// JOUR MÊME ; à défaut, les deux jours suivants (≈ 48 h) — un jour creux, le
	// dashboard garde un contenu. La sélection vit dans domain/daily-analysis.ts
	// (fonction pure, testée). Ici on n'assemble que les candidats — aucune proba
	// n'est calculée : on lit la table predictions.
	const jour = cleDuJour(Date.now());
	const fixtures = await sports.upcomingFixtures();
	// On borne à aujourd'hui + les deux jours suivants : c'est la fenêtre où la
	// lecture du jour peut piocher, et ça borne le nombre de lectures de predictions.
	const fenetre = fixtures.filter((f) => {
		const d = joursDecart(jour, cleDuJour(Date.parse(f.dateUtc)));
		return d >= 0 && d <= 2;
	});
	const candidats: CandidatJour[] = await Promise.all(
		fenetre.map(async (f) => {
			const preds = await predictions.forFixture(f.id);
			const probas: Partial<Record<Market, number>> = {};
			for (const p of preds) probas[p.marche] = p.probabilite;
			return {
				fixtureId: f.id,
				teamHome: f.teamHome,
				teamAway: f.teamAway,
				dateMs: Date.parse(f.dateUtc),
				probas
			};
		})
	);
	const daily: DailyMatch | null = choisirAnalyseDuJour(candidats, jour);

	// Cas vraiment vide : rien d'intéressant sur 48 h. On ne montre pas un bloc vide,
	// on montre le compteur honnête — combien de matchs sont analysés en ce moment
	// (matchs distincts de la fenêtre d'analyse ayant au moins une probabilité).
	const analyseesEnCours =
		daily === null ? await predictions.countAnalysees(fixtures.map((f) => f.id)) : 0;

	// État « vue » : une fois consultée dans la journée, on n'affiche plus le
	// chiffre — on montre le prochain rendez-vous. Consulter = charger l'accueil.
	const today = jour;
	const dailyVue = event.cookies.get('mtj_daily') === today;
	if (!dailyVue && daily) {
		event.cookies.set('mtj_daily', today, {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 2
		});
	}

	const [stats, enCours, histo] = await Promise.all([
		dashboardStats(session.userId),
		ticketsEnCours(session.userId),
		listHistoryMarquee(40)
	]);

	// DÉMO (convention) : on garnit les vues pour les rendre dynamiques tant que
	// la base n'a pas de résultats réels. Voir lib/server/demo.ts (DEMO_MODE).
	const now = Date.now();
	const statsFinal = DEMO_MODE ? demoStats() : stats;
	const enCoursFinal = DEMO_MODE ? [...enCours, ...demoTicketsEnCours(now)] : enCours;
	const marquee = histo.length >= 20 ? histo : DEMO_MODE ? demoHistoryItems() : [];

	return {
		prenom: session.prenom,
		credits: session.credits,
		stats: statsFinal,
		daily,
		dailyVue,
		analyseesEnCours,
		ticketsEnCours: enCoursFinal,
		historique: marquee
	};
};
