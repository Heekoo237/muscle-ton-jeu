/**
 * services/payment — Encaissement Mobile Money. Règle d'archi n°6 : deux
 * agrégateurs branchés, aucun point de défaillance unique. Le paiement est
 * asynchrone (confirmation possible jusqu'à 40 s, PRD §8.6). Le crédit n'est
 * jamais posé ici : il l'est à l'affichage réussi du résultat (règles de
 * facturation). Ce service ne fait qu'initier et suivre l'encaissement.
 */
export type PaymentStatus = 'pending' | 'success' | 'failed';

export interface PaymentRequest {
	userId: number;
	/** Montant en francs CFA. */
	montant: number;
	/** Crédits que ce paiement débloquera une fois confirmé. */
	credits: number;
	/** Numéro Mobile Money du payeur. */
	msisdn: string;
}

export interface PaymentIntent {
	txnId: string;
	psp: string;
	status: PaymentStatus;
}

export interface PaymentAggregator {
	readonly name: string;
	initiate(req: PaymentRequest): Promise<PaymentIntent>;
	status(txnId: string): Promise<PaymentStatus>;
	/** Disponibilité, pour le basculement du routeur. */
	healthy(): Promise<boolean>;
}

export interface PaymentService {
	initiate(req: PaymentRequest): Promise<PaymentIntent>;
	status(txnId: string): Promise<PaymentStatus>;
}

import { PaymentRouter } from './router';
import { FakeAggregator } from './fake';

/** ← Points de bascule vers les vrais agrégateurs Mobile Money (Session 8). */
function createPaymentService(): PaymentService {
	return new PaymentRouter([new FakeAggregator('psp_a'), new FakeAggregator('psp_b')]);
}

export const payment: PaymentService = createPaymentService();
