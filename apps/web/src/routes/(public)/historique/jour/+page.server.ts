import type { PageServerLoad } from './$types';
import { computePublicHistory } from '$lib/server/fixtures/publicHistoryStore';
import { libelleDate, type TicketPublic } from '$lib/server/domain/publicHistory';
import type { TicketPublicVM } from '../+page.server';

/**
 * Liste COMPLÈTE des tickets réglés du jour (le « voir les N » de l'historique). Même
 * source, même règles : anonyme, sous le plancher, caché au CDN. Aucun exemple choisi
 * ici — tout le jour, dans l'ordre chronologique inverse.
 */
const OFFSET_MS = 3_600_000;

export const load: PageServerLoad = async ({ setHeaders }) => {
	const now = Date.now();
	const data = await computePublicHistory(now);
	setHeaders({
		'cache-control': 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400'
	});
	const withDate = (t: TicketPublic): TicketPublicVM => ({
		...t,
		dateLabel: libelleDate(t.analyseLeMs, now, OFFSET_MS)
	});
	return {
		sousLePlancher: data.sousLePlancher,
		nbDuJour: data.nbDuJour,
		tickets: data.tousDuJour.map(withDate)
	};
};
