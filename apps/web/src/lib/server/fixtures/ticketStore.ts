/**
 * ticketStore.ts — Magasin de tickets FACTICE, en mémoire. Remplacé en Session 8
 * par les tables `tickets`/`selections` sur Supabase. Le ticket est sauvegardé
 * DÈS la validation de lecture, avant tout paiement (règle de facturation n°2).
 *
 * Note : l'état en mémoire ne survit pas au serverless en production — c'est
 * précisément pour ça que la vraie persistance passe en base. Ici, pour le
 * parcours en développement, c'est suffisant.
 */
import type { Selection, TicketStatus } from '$lib/types';

export interface StoredResult {
	probaTotalePct: number;
	probaRenforceePct: number;
	nbRetirees: number;
	nbFragiles: number;
}

export interface StoredBilling {
	gratuit: boolean;
	credits: number;
}

export interface StoredTicket {
	id: string;
	statut: TicketStatus;
	selections: Selection[];
	creeLe: number;
	/** Horodatage réel de création (pour l'affichage « Sam. 14 »). */
	creeLeMs: number;
	/** Chiffres figés à l'affichage du résultat (source de l'image de partage). */
	result?: StoredResult;
	/** Décision de facturation appliquée une fois (débit idempotent). */
	billing?: StoredBilling;
}

const store = new Map<string, StoredTicket>();
let counter = 0;

export function createTicket(selections: Selection[]): StoredTicket {
	const id = `t_${++counter}_${selections.length}`;
	const ticket: StoredTicket = {
		id,
		statut: 'en_lecture',
		selections,
		creeLe: counter,
		creeLeMs: Date.now()
	};
	store.set(id, ticket);
	return ticket;
}

export function getTicket(id: string): StoredTicket | undefined {
	return store.get(id);
}

/** Tickets analysés, les plus récents d'abord (pour « Mes tickets »). */
export function listAnalysedTickets(): StoredTicket[] {
	return [...store.values()]
		.filter((t) => t.statut === 'analyse')
		.sort((a, b) => b.creeLe - a.creeLe);
}

export function updateTicket(id: string, patch: Partial<StoredTicket>): StoredTicket | undefined {
	const t = store.get(id);
	if (!t) return undefined;
	const next = { ...t, ...patch };
	store.set(id, next);
	return next;
}
