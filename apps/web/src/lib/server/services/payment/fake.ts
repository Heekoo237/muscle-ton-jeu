import type { PaymentAggregator, PaymentRequest, PaymentIntent, PaymentStatus } from './index';

/**
 * Agrégateur factice : confirme de façon asynchrone après un court délai, comme
 * un vrai Mobile Money (5–40 s en réel). Déterministe par txnId pour les tests.
 */
export class FakeAggregator implements PaymentAggregator {
	private intents = new Map<string, { at: number; delayMs: number }>();
	private counter = 0;

	constructor(public readonly name: string) {}

	async healthy(): Promise<boolean> {
		return true;
	}

	async initiate(req: PaymentRequest): Promise<PaymentIntent> {
		const txnId = `${this.name}_${++this.counter}_${req.userId}`;
		this.intents.set(txnId, { at: Date.now(), delayMs: 2000 }); // « confirmé » après 2 s
		return { txnId, psp: this.name, status: 'pending' };
	}

	async status(txnId: string): Promise<PaymentStatus> {
		const it = this.intents.get(txnId);
		if (!it) return 'failed';
		return Date.now() - it.at >= it.delayMs ? 'success' : 'pending';
	}
}
