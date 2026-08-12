import type {
	NotificationsService,
	PushSubscriptionInput,
	NotificationPayload
} from './index';

/** File factice : mémorise les envois, n'émet rien vers l'extérieur. */
export class FakeNotifications implements NotificationsService {
	readonly subscriptions = new Map<number, PushSubscriptionInput>();
	readonly sent: { userId: number; payload: NotificationPayload }[] = [];

	async saveSubscription(userId: number, sub: PushSubscriptionInput): Promise<void> {
		this.subscriptions.set(userId, sub);
	}

	async notify(userId: number, payload: NotificationPayload): Promise<void> {
		this.sent.push({ userId, payload });
	}
}
