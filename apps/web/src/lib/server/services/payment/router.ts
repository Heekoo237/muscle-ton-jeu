import type {
	PaymentService,
	PaymentAggregator,
	PaymentRequest,
	PaymentIntent,
	PaymentStatus
} from './index';

/**
 * Routeur à bascule : tente le premier agrégateur sain, retombe sur le second.
 * Aucun point de défaillance unique. Retient l'agrégateur utilisé par txnId
 * pour suivre le bon fournisseur au moment de la confirmation.
 */
export class PaymentRouter implements PaymentService {
	private byTxn = new Map<string, PaymentAggregator>();

	constructor(private readonly aggregators: PaymentAggregator[]) {}

	async initiate(req: PaymentRequest): Promise<PaymentIntent> {
		let lastError: unknown;
		for (const agg of this.aggregators) {
			try {
				if (!(await agg.healthy())) continue;
				const intent = await agg.initiate(req);
				this.byTxn.set(intent.txnId, agg);
				return intent;
			} catch (err) {
				lastError = err;
			}
		}
		throw new Error(
			`Aucun agrégateur de paiement disponible${lastError ? ` : ${String(lastError)}` : ''}`
		);
	}

	async status(txnId: string): Promise<PaymentStatus> {
		const agg = this.byTxn.get(txnId);
		if (agg) return agg.status(txnId);
		// Fallback : interroger tous les agrégateurs si l'association est perdue.
		for (const a of this.aggregators) {
			try {
				return await a.status(txnId);
			} catch {
				/* essayer le suivant */
			}
		}
		return 'pending';
	}
}
