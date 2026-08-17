import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';

/** Clé de jour local (approx. WAT/GMT) pour l'analyse offerte du jour. */
function dayKey(d = new Date()): string {
	return d.toISOString().slice(0, 10);
}

/**
 * Chrome du dashboard : identité (prénom + photo Google) et cloche de
 * notifications. Le contenu des notifications est dérivé de l'état réel — jamais
 * d'événement d'un autre utilisateur, jamais de promesse de gain (CLAUDE.md).
 *
 * `getAppSession` est mis en cache par requête (aucune relecture) et `montreCredits`
 * est repris du layout parent via `parent()` — plus de second `hasRecharged`.
 */
export const load: LayoutServerLoad = async (event) => {
	const session = await getAppSession(event);
	if (!session) {
		// Route protégée : on revient exactement là où l'utilisateur voulait aller.
		const cible = event.url.pathname + event.url.search;
		redirect(303, `/connexion?retour=${encodeURIComponent(cible)}`);
	}

	const { montreCredits } = await event.parent();

	// Notifications factuelles (Web Push natif branché en Session 8).
	const notifications: string[] = [];
	if (event.cookies.get('mtj_daily') !== dayKey()) {
		notifications.push('Ton analyse offerte du jour est disponible.');
	}
	if (montreCredits && session.credits === 1) {
		notifications.push('Il te reste 1 crédit.');
	}

	return {
		prenom: session.prenom,
		avatarUrl: session.avatarUrl,
		credits: session.credits,
		montreCredits,
		notifications
	};
};
