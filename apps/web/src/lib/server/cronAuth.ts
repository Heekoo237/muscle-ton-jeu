/**
 * cronAuth.ts — Protège les endpoints de tâche planifiée. Seul un appelant
 * porteur du secret partagé (`CRON_SECRET`) déclenche le règlement ou le matin.
 * Le déclencheur de TEST passe par le même secret : on ne veut pas qu'une URL
 * publique puisse spammer des notifications.
 */
import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

/** Vrai si la requête porte le bon secret (en-tête Bearer ou `?key=`). */
export function cronAutorise(event: RequestEvent): boolean {
	const secret = env.CRON_SECRET;
	if (!secret) return false; // pas de secret configuré → on refuse tout (jamais ouvert)
	const auth = event.request.headers.get('authorization');
	if (auth === `Bearer ${secret}`) return true;
	return event.url.searchParams.get('key') === secret;
}
