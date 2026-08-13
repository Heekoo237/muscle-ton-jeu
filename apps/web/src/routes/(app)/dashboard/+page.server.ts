import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { sports, predictions } from '$lib/server/services';
import { marketLabelFr } from '$lib/server/domain/market-map';
import { dashboardStats, ticketsEnCours } from '$lib/server/fixtures/dashboardStore';
import { listHistoryMarquee } from '$lib/server/fixtures/historyStore';

export interface DailyMatch {
	matchLabel: string;
	dateMs: number;
	marche: string;
	probabilitePct: number;
}

/** Clé de jour local (approx. WAT/GMT) — l'analyse offerte se réinitialise à minuit. */
function dayKey(d = new Date()): string {
	return d.toISOString().slice(0, 10);
}

export const load: PageServerLoad = async (event) => {
	// Le +layout impose déjà la session (sinon redirection vers connexion).
	const session = (await getAppSession(event))!;

	// Analyse offerte du jour : le match le plus probable, affiché directement.
	const fixtures = await sports.upcomingFixtures();
	let daily: DailyMatch | null = null;
	if (fixtures.length > 0) {
		const f = fixtures[0];
		const preds = await predictions.forFixture(f.id);
		if (preds.length > 0) {
			const best = preds.reduce((a, b) => (b.probabilite > a.probabilite ? b : a));
			daily = {
				matchLabel: `${f.teamHome} – ${f.teamAway}`,
				dateMs: Date.parse(f.dateUtc),
				marche: marketLabelFr(best.marche, f.teamHome, f.teamAway),
				probabilitePct: Math.round(best.probabilite * 100 * 10) / 10
			};
		}
	}

	// État « vue » : une fois consultée dans la journée, on n'affiche plus le
	// chiffre — on montre le prochain rendez-vous. Consulter = charger l'accueil.
	const today = dayKey();
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

	return {
		prenom: session.prenom,
		credits: session.credits,
		stats,
		daily,
		dailyVue,
		ticketsEnCours: enCours,
		historique: histo.length >= 20 ? histo : []
	};
};
