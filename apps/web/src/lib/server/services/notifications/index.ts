/**
 * services/notifications — Web Push natif (VAPID). Canal unique de notification
 * sortante (PRD §10) : jamais de WhatsApp sortant. L'autorisation est demandée
 * sur l'écran de résultat, jamais à l'arrivée.
 */
export interface PushSubscriptionInput {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface NotificationPayload {
	titre: string;
	corps: string;
	/** Lien ouvert au tap (ex. l'analyse concernée). */
	url?: string;
}

export interface NotificationsService {
	saveSubscription(userId: number, sub: PushSubscriptionInput): Promise<void>;
	notify(userId: number, payload: NotificationPayload): Promise<void>;
}

import { FakeNotifications } from './fake';
import { WebPushNotifications, webPushConfigured } from './webpush';

/**
 * Bascule : Web Push RÉEL si les clés VAPID sont présentes, sinon file factice
 * (local, tests). Renseigner PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT = passer en réel, sans refonte.
 */
function createNotificationsService(): NotificationsService {
	return webPushConfigured() ? new WebPushNotifications() : new FakeNotifications();
}

export const notifications: NotificationsService = createNotificationsService();
