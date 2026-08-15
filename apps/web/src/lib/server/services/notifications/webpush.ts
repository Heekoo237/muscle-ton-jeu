/**
 * webpush.ts — Web Push RÉEL (VAPID), via la lib `web-push`. Canal unique de
 * notification sortante (PRD §10). La clé privée ne quitte jamais le serveur.
 *
 * - `saveSubscription` : upsert par ENDPOINT (unique) → un appareil ne crée jamais
 *   deux abonnements ; se réabonner met simplement à jour le propriétaire.
 * - `notify` : envoie à TOUS les appareils de l'utilisateur ; un abonnement expiré
 *   (404/410) est supprimé — on ne garde pas de destinataires morts.
 *
 * L'IDEMPOTENCE (une notif par événement) n'est PAS ici : elle est portée par la
 * réservation atomique `reserver_notification` (migration 0012), appelée par le job.
 */
import webpush from 'web-push';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import { supabaseAdmin } from '$lib/server/supabase';
import type { NotificationsService, NotificationPayload, PushSubscriptionInput } from './index';

/** Vrai si les trois variables VAPID sont présentes (sinon on reste sur le factice). */
export function webPushConfigured(): boolean {
	return Boolean(pub.PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

let vapidSet = false;
function ensureVapid(): void {
	if (vapidSet) return;
	webpush.setVapidDetails(env.VAPID_SUBJECT!, pub.PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
	vapidSet = true;
}

interface SubRow {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export class WebPushNotifications implements NotificationsService {
	async saveSubscription(userId: number, sub: PushSubscriptionInput): Promise<void> {
		const db = supabaseAdmin();
		// Upsert sur l'endpoint unique : réabonnement = mise à jour, jamais un doublon.
		const { error } = await db
			.from('push_subscriptions')
			.upsert(
				{ user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
				{ onConflict: 'endpoint' }
			);
		if (error) throw new Error(`saveSubscription: ${error.message}`);
	}

	async notify(userId: number, payload: NotificationPayload): Promise<void> {
		ensureVapid();
		const db = supabaseAdmin();
		const { data, error } = await db
			.from('push_subscriptions')
			.select('endpoint, p256dh, auth')
			.eq('user_id', userId);
		if (error) throw new Error(`notify (lecture abonnements): ${error.message}`);
		const subs = (data ?? []) as SubRow[];
		if (subs.length === 0) return; // pas d'appareil : rien à envoyer (pas une erreur)

		const body = JSON.stringify(payload);
		const morts: string[] = [];
		await Promise.all(
			subs.map(async (s) => {
				try {
					await webpush.sendNotification(
						{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
						body
					);
				} catch (e) {
					const code = (e as { statusCode?: number }).statusCode;
					// 404/410 : abonnement expiré côté navigateur → on le retire.
					if (code === 404 || code === 410) morts.push(s.endpoint);
					else console.error(`[push] échec envoi (user ${userId}, code ${code ?? '?'})`);
				}
			})
		);
		if (morts.length) {
			await db.from('push_subscriptions').delete().in('endpoint', morts);
			console.log(`[push] ${morts.length} abonnement(s) expiré(s) retiré(s)`);
		}
	}
}
