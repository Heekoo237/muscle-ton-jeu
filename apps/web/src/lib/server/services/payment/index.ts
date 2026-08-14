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
import { assertRealInProduction } from '$lib/server/guardFake';

/** Vrai quand de VRAIS agrégateurs Mobile Money sont branchés. Aujourd'hui aucun
 *  n'existe → false. Quand ils arriveront : tester ici la présence de leurs clés. */
function realPaymentConfigured(): boolean {
	return false; // TODO paiement réel : brancher ≥ 1 agrégateur et tester sa config
}

/** ← Points de bascule vers les vrais agrégateurs Mobile Money.
 *  GARDE-FOU : un paiement factice en production ferait croire à une recharge
 *  réussie — le pire risque de la liste (« j'ai payé, je n'ai rien reçu »). En
 *  production, le factice fait donc ÉCHOUER le démarrage. */
function createPaymentService(): PaymentService {
	assertRealInProduction('paiement (Mobile Money)', realPaymentConfigured());
	return new PaymentRouter([new FakeAggregator('psp_a'), new FakeAggregator('psp_b')]);
}

export const payment: PaymentService = createPaymentService();
