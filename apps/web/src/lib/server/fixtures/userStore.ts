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
import { ANALYSES_OFFERTES } from '$lib/offer';
import type { StoredResult } from './ticketStore';

export type LedgerReason = 'recharge' | 'debit_analyse' | 'offert' | 'parrainage';

export interface AppUser {
	id: number;
	prenom: string;
	email: string;
	credits: number;
	premierTicketUtilise: boolean;
	/** Nombre d'analyses OFFERTES déjà consommées (bêta : plafond ANALYSES_OFFERTES). */
	analysesOffertesUtilisees: number;
}

/* ------------------------------------------------------------------------ */
/*  Repli en mémoire (local, sans Supabase)                                  */
/* ------------------------------------------------------------------------ */
const memUser: AppUser = {
	id: 1,
	prenom: 'Démo',
	email: 'demo@example.com',
	credits: 0,
	premierTicketUtilise: false,
	analysesOffertesUtilisees: 0
};
const memLedger: { motif: LedgerReason }[] = [];

/* ------------------------------------------------------------------------ */
/*  Interface publique (async)                                               */
/* ------------------------------------------------------------------------ */

/**
 * Trouve ou crée l'utilisateur applicatif lié à un compte Google, en indiquant
 * s'il vient d'être créé (`isNew`) — utile pour router un compte neuf différemment.
 */
export async function ensureAppUserDetailed(
	googleId: string,
	email: string,
	prenom: string
): Promise<{ user: AppUser; isNew: boolean }> {
	if (!isSupabaseConfigured()) return { user: memUser, isNew: false };
	const sb = supabaseAdmin();
	const { data: found } = await sb
		.from('users')
		.select('id, prenom, email, credits, premier_ticket_utilise, analyses_offertes_utilisees')
		.eq('google_id', googleId)
		.maybeSingle();
	if (found) return { user: toAppUser(found), isNew: false };
	const { data: created, error } = await sb
		.from('users')
		.insert({ google_id: googleId, email, prenom })
		.select('id, prenom, email, credits, premier_ticket_utilise, analyses_offertes_utilisees')
		.single();
	if (error) throw error;
	return { user: toAppUser(created), isNew: true };
}

/** Trouve ou crée l'utilisateur applicatif lié à un compte Google. */
export async function ensureAppUser(
	googleId: string,
	email: string,
	prenom: string
): Promise<AppUser> {
	const { user } = await ensureAppUserDetailed(googleId, email, prenom);
	return user;
}

export async function getUserById(userId: number): Promise<AppUser | null> {
	if (!isSupabaseConfigured()) return memUser;
	const sb = supabaseAdmin();
	const { data } = await sb
		.from('users')
		.select('id, prenom, email, credits, premier_ticket_utilise, analyses_offertes_utilisees')
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

/**
 * Consomme UNE analyse offerte, ATOMIQUEMENT et une seule fois. L'`UPDATE`
 * conditionnel (`analyses_offertes_utilisees < plafond`) n'incrémente que s'il
 * reste une offerte — deux requêtes concurrentes ne peuvent pas en accorder deux.
 * Renvoie true si une offerte a bien été accordée, false sinon (plafond atteint).
 * (Même garde d'atomicité que la recharge — pas de read-then-write.)
 */
export async function consommerAnalyseOfferte(userId: number): Promise<boolean> {
	if (!isSupabaseConfigured()) {
		if (memUser.analysesOffertesUtilisees >= ANALYSES_OFFERTES) return false;
		memUser.analysesOffertesUtilisees += 1;
		return true;
	}
	const { data, error } = await supabaseAdmin().rpc('consommer_analyse_offerte', {
		p_user: userId,
		p_plafond: ANALYSES_OFFERTES
	});
	if (error) throw error;
	return data === true;
}

/**
 * Débite ATOMIQUEMENT `p_cost` crédits et pose la ligne de grand livre dans la
 * MÊME transaction. Le solde est enforçé AU NIVEAU BASE (`credits >= p_cost`) :
 * deux affichages concurrents partant du même solde ne peuvent plus payer deux
 * analyses. Renvoie true si débité, false si solde insuffisant (l'appelant
 * redirige alors vers la recharge). Fin du read-then-write de `record()` sur le
 * chemin de facturation et de la garde sur un solde de SESSION périmé.
 */
export async function debiterCredits(
	userId: number,
	cost: number,
	ticketId?: string
): Promise<boolean> {
	if (!isSupabaseConfigured()) {
		if (memUser.credits < cost) return false;
		memUser.credits -= cost;
		memLedger.push({ motif: 'debit_analyse' });
		return true;
	}
	const { data, error } = await supabaseAdmin().rpc('debiter_credits', {
		p_user: userId,
		p_cost: cost,
		p_ticket: ticketId ? Number(ticketId) : null
	});
	if (error) throw error;
	return data === true;
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
	analyses_offertes_utilisees?: number | null;
}): AppUser {
	return {
		id: row.id,
		prenom: row.prenom ?? 'Invité',
		email: row.email ?? '',
		credits: row.credits ?? 0,
		premierTicketUtilise: row.premier_ticket_utilise ?? false,
		analysesOffertesUtilisees: row.analyses_offertes_utilisees ?? 0
	};
}

export type { StoredResult };
