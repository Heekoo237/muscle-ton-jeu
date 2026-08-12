/**
 * userStore.ts — Utilisateur + registre de crédits FACTICES, en mémoire.
 * Remplacés en Session 8 par `users` / `credit_ledger` sur Supabase.
 *
 * Le registre (`ledger`) est la source de vérité du solde : chaque débit (à
 * l'affichage du résultat) et chaque recharge y est inscrit. `credits` en est le
 * cache. Règle de facturation n°1 : le crédit se débite à l'affichage réussi.
 */
import type { StoredResult } from './ticketStore';

export type LedgerReason = 'recharge' | 'debit_analyse' | 'offert' | 'parrainage';

export interface LedgerEntry {
	delta: number;
	motif: LedgerReason;
	ticketId?: string;
	le: number;
}

export interface DemoUser {
	id: number;
	prenom: string;
	email: string;
	credits: number;
	premierTicketUtilise: boolean;
}

// Utilisateur de démonstration : commence sans crédit et sans premier ticket
// utilisé, pour exercer à la fois la gratuité du premier ticket puis le blocage.
const user: DemoUser = {
	id: 1,
	prenom: 'Démo',
	email: 'demo@example.com',
	credits: 0,
	premierTicketUtilise: false
};

const ledger: LedgerEntry[] = [];
let seq = 0;

export function getUser(): DemoUser {
	return user;
}

export function record(delta: number, motif: LedgerReason, ticketId?: string): void {
	ledger.push({ delta, motif, ticketId, le: ++seq });
	user.credits += delta;
}

export function markPremierTicketUtilise(): void {
	user.premierTicketUtilise = true;
}

export function ledgerEntries(): readonly LedgerEntry[] {
	return ledger;
}

/** A déjà rechargé au moins une fois (pour masquer l'encart premier passage). */
export function hasRecharged(): boolean {
	return ledger.some((e) => e.motif === 'recharge');
}

// Réexport pratique pour les appelants qui figent un résultat.
export type { StoredResult };
