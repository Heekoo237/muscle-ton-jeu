/**
 * notif-schedule.ts — Fenêtre des HEURES CALMES, déterministe et locale.
 *
 * Règle non négociable : jamais de notification entre 22 h et 7 h HEURE LOCALE.
 * Nos utilisateurs sont au Cameroun (UTC+1), au Bénin/Côte d'Ivoire (UTC+0/+1) :
 * on prend UTC+1 comme référence — l'écart d'une heure est acceptable et assumé.
 *
 * Une notification retenue par les heures calmes n'est PAS perdue : le règlement
 * pose bien le résultat en base, mais n'ENVOIE le push qu'à un passage hors
 * fenêtre. Le prochain passage après 7 h (le cron de 6 h UTC = 7 h locale) l'émet.
 */

/** Décalage de référence (heure locale = UTC + OFFSET). Afrique de l'Ouest francophone. */
export const FUSEAU_OFFSET_HEURES = 1;

/** Heure locale de début (incluse) et de fin (exclue) des heures calmes. */
export const CALME_DEBUT = 22;
export const CALME_FIN = 7;

/** Heure locale (0–23) correspondant à un instant, sous le fuseau de référence. */
export function heureLocale(nowMs: number, offset = FUSEAU_OFFSET_HEURES): number {
	const utcH = new Date(nowMs).getUTCHours();
	return (utcH + offset + 24) % 24;
}

/**
 * Sommes-nous dans les heures calmes (22 h–7 h locale) ? On n'ENVOIE aucun push
 * pendant cette fenêtre ; on attend le prochain passage hors fenêtre.
 */
export function enHeuresCalmes(nowMs: number, offset = FUSEAU_OFFSET_HEURES): boolean {
	const h = heureLocale(nowMs, offset);
	return h >= CALME_DEBUT || h < CALME_FIN;
}
