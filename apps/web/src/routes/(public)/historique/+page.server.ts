import type { PageServerLoad } from './$types';
import { computePublicHistory } from '$lib/server/fixtures/publicHistoryStore';
import { libelleDate, type TicketPublic } from '$lib/server/domain/publicHistory';

/**
 * Historique public — la DÉTECTION et l'EFFET DU RETRAIT, avec les cotes (décision
 * arrêtée, CLAUDE.md). JAMAIS un taux de réussite. On montre les BASCULES (perdu tel
 * quel, gagnant après retrait) ET les échecs, cotes transcrites à l'appui.
 *
 * Anonyme (aucun identifiant), sous le plancher des 20 tickets réglés tant que le
 * volume n'y est pas, et CACHÉ AU CDN (page publique, potentiellement très consultée) :
 * la fonction ne tourne qu'~une fois toutes les 30 min par région, le CDN absorbe le
 * reste. Aucune table de précalcul — on ne sur-construit pas.
 */
const OFFSET_MS = 3_600_000; // Afrique de l'Ouest/Centrale (UTC+1)

export interface TicketPublicVM extends TicketPublic {
	dateLabel: string;
}

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
		nbBascules: data.nbBascules,
		nbDuJour: data.nbDuJour,
		exemples: data.exemples.map(withDate)
	};
};
