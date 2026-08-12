/**
 * rechargeStore.ts — Suivi FACTICE des recharges en cours, en mémoire. Associe
 * une transaction (txnId du routeur de paiement) aux crédits à créditer et à la
 * page de retour. Remplacé en Session 8 par la table `transactions` + webhook PSP.
 *
 * Le crédit n'est posé qu'une fois, à la confirmation du paiement.
 */
export interface PendingRecharge {
	credits: number;
	retour: string;
	packNom: string;
	credited: boolean;
}

const pending = new Map<string, PendingRecharge>();

export function trackRecharge(txnId: string, data: Omit<PendingRecharge, 'credited'>): void {
	pending.set(txnId, { ...data, credited: false });
}

export function getRecharge(txnId: string): PendingRecharge | undefined {
	return pending.get(txnId);
}

export function markCredited(txnId: string): void {
	const p = pending.get(txnId);
	if (p) p.credited = true;
}
