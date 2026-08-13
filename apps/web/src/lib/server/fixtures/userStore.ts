/**
 * userStore.ts — Utilisateur + registre de crédits, par compte.
 *
 * Deux implémentations derrière la même interface async : Supabase (persistant,
 * un utilisateur par compte Google) si configuré, sinon un utilisateur de
 * démonstration unique en mémoire (local).
 *
 * Le registre `credit_ledger` est la source de vérité du solde ; `users.credits`
 * en est le cache. Le crédit se débite à l'affichage réussi (facturation n°1).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import type { StoredResult } from './ticketStore';

export type LedgerReason = 'recharge' | 'debit_analyse' | 'offert' | 'parrainage';

export interface AppUser {
	id: number;
	prenom: string;
	email: string;
	credits: number;
	premierTicketUtilise: boolean;
}

/* ------------------------------------------------------------------------ */
/*  Repli en mémoire (local, sans Supabase)                                  */
/* ------------------------------------------------------------------------ */
const memUser: AppUser = {
	id: 1,
	prenom: 'Démo',
	email: 'demo@example.com',
	credits: 0,
	premierTicketUtilise: false
};
const memLedger: { motif: LedgerReason }[] = [];

/* ------------------------------------------------------------------------ */
/*  Interface publique (async)                                               */
/* ------------------------------------------------------------------------ */

/** Trouve ou crée l'utilisateur applicatif lié à un compte Google. */
export async function ensureAppUser(
	googleId: string,
	email: string,
	prenom: string
): Promise<AppUser> {
	if (!isSupabaseConfigured()) return memUser;
	const sb = supabaseAdmin();
	const { data: found } = await sb
		.from('users')
		.select('id, prenom, email, credits, premier_ticket_utilise')
		.eq('google_id', googleId)
		.maybeSingle();
	let row = found;
	if (!row) {
		const { data: created, error } = await sb
			.from('users')
			.insert({ google_id: googleId, email, prenom })
			.select('id, prenom, email, credits, premier_ticket_utilise')
			.single();
		if (error) throw error;
		row = created;
	}
	return toAppUser(row);
}

export async function getUserById(userId: number): Promise<AppUser | null> {
	if (!isSupabaseConfigured()) return memUser;
	const sb = supabaseAdmin();
	const { data } = await sb
		.from('users')
		.select('id, prenom, email, credits, premier_ticket_utilise')
		.eq('id', userId)
		.maybeSingle();
	return data ? toAppUser(data) : null;
}

export async function record(
	userId: number,
	delta: number,
	motif: LedgerReason,
	ticketId?: string
): Promise<void> {
	if (!isSupabaseConfigured()) {
		memLedger.push({ motif });
		memUser.credits += delta;
		return;
	}
	const sb = supabaseAdmin();
	await sb.from('credit_ledger').insert({
		user_id: userId,
		delta,
		motif,
		ticket_id: ticketId ? Number(ticketId) : null
	});
	const u = await getUserById(userId);
	await sb.from('users').update({ credits: (u?.credits ?? 0) + delta }).eq('id', userId);
}

export async function markPremierTicketUtilise(userId: number): Promise<void> {
	if (!isSupabaseConfigured()) {
		memUser.premierTicketUtilise = true;
		return;
	}
	await supabaseAdmin().from('users').update({ premier_ticket_utilise: true }).eq('id', userId);
}

export async function hasRecharged(userId: number): Promise<boolean> {
	if (!isSupabaseConfigured()) {
		return memLedger.some((e) => e.motif === 'recharge');
	}
	const { count } = await supabaseAdmin()
		.from('credit_ledger')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('motif', 'recharge');
	return (count ?? 0) > 0;
}

/** Session factice locale : l'utilisateur démo unique. */
export function memDemoUser(): AppUser {
	return memUser;
}

function toAppUser(row: {
	id: number;
	prenom: string | null;
	email: string | null;
	credits: number | null;
	premier_ticket_utilise: boolean | null;
}): AppUser {
	return {
		id: row.id,
		prenom: row.prenom ?? 'Invité',
		email: row.email ?? '',
		credits: row.credits ?? 0,
		premierTicketUtilise: row.premier_ticket_utilise ?? false
	};
}

export type { StoredResult };
