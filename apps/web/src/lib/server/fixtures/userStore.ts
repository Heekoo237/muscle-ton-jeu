/**
 * userStore.ts — Utilisateur + registre de crédits.
 *
 * Deux implémentations derrière la même interface (async) :
 *  - Supabase (persistant) quand les variables d'env sont présentes ;
 *  - en mémoire (factice) sinon — pour le développement local.
 *
 * Le registre `credit_ledger` est la source de vérité du solde ; `users.credits`
 * en est le cache. Règle de facturation n°1 : le crédit se débite à l'affichage.
 *
 * Tant que l'authentification Google réelle n'est pas branchée, on travaille avec
 * un utilisateur de démonstration unique (google_id = '__demo__').
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import type { StoredResult } from './ticketStore';

export type LedgerReason = 'recharge' | 'debit_analyse' | 'offert' | 'parrainage';

export interface DemoUser {
	id: number;
	prenom: string;
	email: string;
	credits: number;
	premierTicketUtilise: boolean;
}

const DEMO_GOOGLE_ID = '__demo__';

/* ------------------------------------------------------------------------ */
/*  Implémentation en mémoire (repli local)                                  */
/* ------------------------------------------------------------------------ */
const memUser: DemoUser = {
	id: 1,
	prenom: 'Démo',
	email: 'demo@example.com',
	credits: 0,
	premierTicketUtilise: false
};
const memLedger: { motif: LedgerReason }[] = [];

/* ------------------------------------------------------------------------ */
/*  Implémentation Supabase                                                   */
/* ------------------------------------------------------------------------ */
async function ensureDemoUser(): Promise<DemoUser> {
	const sb = supabaseAdmin();
	const { data: found } = await sb
		.from('users')
		.select('id, prenom, email, credits, premier_ticket_utilise')
		.eq('google_id', DEMO_GOOGLE_ID)
		.maybeSingle();
	let row = found;
	if (!row) {
		const { data: created, error } = await sb
			.from('users')
			.insert({ google_id: DEMO_GOOGLE_ID, prenom: 'Démo', email: 'demo@example.com', credits: 0 })
			.select('id, prenom, email, credits, premier_ticket_utilise')
			.single();
		if (error) throw error;
		row = created;
	}
	return {
		id: row.id,
		prenom: row.prenom ?? 'Démo',
		email: row.email ?? '',
		credits: row.credits ?? 0,
		premierTicketUtilise: row.premier_ticket_utilise ?? false
	};
}

/* ------------------------------------------------------------------------ */
/*  Interface publique (async)                                               */
/* ------------------------------------------------------------------------ */
export async function getUser(): Promise<DemoUser> {
	if (!isSupabaseConfigured()) return memUser;
	return ensureDemoUser();
}

export async function record(delta: number, motif: LedgerReason, ticketId?: string): Promise<void> {
	if (!isSupabaseConfigured()) {
		memLedger.push({ motif });
		memUser.credits += delta;
		return;
	}
	const sb = supabaseAdmin();
	const u = await ensureDemoUser();
	await sb.from('credit_ledger').insert({
		user_id: u.id,
		delta,
		motif,
		ticket_id: ticketId ? Number(ticketId) : null
	});
	await sb.from('users').update({ credits: u.credits + delta }).eq('id', u.id);
}

export async function markPremierTicketUtilise(): Promise<void> {
	if (!isSupabaseConfigured()) {
		memUser.premierTicketUtilise = true;
		return;
	}
	const sb = supabaseAdmin();
	const u = await ensureDemoUser();
	await sb.from('users').update({ premier_ticket_utilise: true }).eq('id', u.id);
}

export async function hasRecharged(): Promise<boolean> {
	if (!isSupabaseConfigured()) {
		return memLedger.some((e) => e.motif === 'recharge');
	}
	const sb = supabaseAdmin();
	const u = await ensureDemoUser();
	const { count } = await sb
		.from('credit_ledger')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', u.id)
		.eq('motif', 'recharge');
	return (count ?? 0) > 0;
}

export type { StoredResult };
