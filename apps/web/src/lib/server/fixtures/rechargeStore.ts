/**
 * rechargeStore.ts — Cycle de vie des transactions de recharge. Deux implémentations
 * derrière la même interface : Supabase (table `transactions`) si configuré, sinon en
 * mémoire (local, tests). La logique money-critique est IDENTIQUE des deux côtés.
 *
 * Invariants (point 7 du brief) :
 *  - le crédit est posé UNE fois, à la confirmation, jamais avant ;
 *  - une référence UNIQUE par transaction, montrée à l'utilisateur ;
 *  - IDEMPOTENCE : deux confirmations → un seul crédit (transition conditionnelle) ;
 *  - une seule recharge « en cours » par utilisateur (garde double-recharge).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { record } from '$lib/server/fixtures/userStore';

export type TxStatut = 'initiated' | 'pending' | 'success' | 'failed' | 'expired';

/** Délai avant qu'une transaction en attente passe en « expired ». Affiché à l'utilisateur. */
export const EXPIRATION_MINUTES = 10;

export interface Transaction {
	reference: string;
	userId: number;
	montant: number;
	credits: number;
	pays: string;
	operateur: string;
	msisdn: string;
	statut: TxStatut;
	creeLeMs: number;
	expireLeMs: number;
}

export interface NouvelleTransaction {
	userId: number;
	montant: number;
	credits: number;
	pays: string;
	operateur: string;
	msisdn: string;
}

/** Référence courte, lisible, copiable : « MTJ-7K3F9Q ». Unicité garantie par l'index. */
export function genererReference(): string {
	const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1, moins d'erreurs de lecture
	let s = '';
	for (let i = 0; i < 6; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
	return `MTJ-${s}`;
}

/* ------------------------------------------------------------------------ */
/*  Implémentation EN MÉMOIRE (repli local + tests) — même invariants        */
/* ------------------------------------------------------------------------ */
const mem = new Map<string, Transaction>();

function memExpirerSiBesoin(t: Transaction, nowMs: number): Transaction {
	if ((t.statut === 'initiated' || t.statut === 'pending') && nowMs >= t.expireLeMs) {
		t.statut = 'expired';
	}
	return t;
}

const memStore = {
	async create(n: NouvelleTransaction, nowMs: number): Promise<Transaction> {
		let reference = genererReference();
		while (mem.has(reference)) reference = genererReference();
		const t: Transaction = {
			...n,
			reference,
			statut: 'pending', // opérateur « contacté » dès l'initiation (mode factice)
			creeLeMs: nowMs,
			expireLeMs: nowMs + EXPIRATION_MINUTES * 60_000
		};
		mem.set(reference, t);
		return t;
	},
	async pendingForUser(userId: number, nowMs: number): Promise<Transaction | null> {
		for (const t of mem.values()) {
			memExpirerSiBesoin(t, nowMs);
			if (t.userId === userId && (t.statut === 'initiated' || t.statut === 'pending')) return t;
		}
		return null;
	},
	async get(reference: string, nowMs: number): Promise<Transaction | null> {
		const t = mem.get(reference);
		return t ? memExpirerSiBesoin(t, nowMs) : null;
	},
	/** Transition conditionnelle atomique (mono-thread JS) → un seul crédit. */
	async confirm(reference: string): Promise<number> {
		const t = mem.get(reference);
		if (!t || (t.statut !== 'initiated' && t.statut !== 'pending')) return 0;
		t.statut = 'success';
		await record(t.userId, t.credits, 'recharge');
		return t.credits;
	},
	async fail(reference: string): Promise<void> {
		const t = mem.get(reference);
		if (t && (t.statut === 'initiated' || t.statut === 'pending')) t.statut = 'failed';
	},
	async expire(reference: string): Promise<void> {
		const t = mem.get(reference);
		if (t && (t.statut === 'initiated' || t.statut === 'pending')) t.statut = 'expired';
	},
	async list(userId: number, nowMs: number): Promise<Transaction[]> {
		return [...mem.values()]
			.map((t) => memExpirerSiBesoin(t, nowMs))
			.filter((t) => t.userId === userId)
			.sort((a, b) => b.creeLeMs - a.creeLeMs);
	}
};

/* ------------------------------------------------------------------------ */
/*  Implémentation SUPABASE                                                  */
/* ------------------------------------------------------------------------ */
function rowToTx(r: Record<string, unknown>): Transaction {
	return {
		reference: String(r.reference),
		userId: Number(r.user_id),
		montant: Number(r.montant),
		credits: Number(r.credits),
		pays: String(r.pays ?? ''),
		operateur: String(r.operateur ?? ''),
		msisdn: String(r.msisdn ?? ''),
		statut: r.statut as TxStatut,
		creeLeMs: Date.parse(String(r.cree_le)),
		expireLeMs: r.expire_le ? Date.parse(String(r.expire_le)) : 0
	};
}

const sbStore = {
	async create(n: NouvelleTransaction, nowMs: number): Promise<Transaction> {
		const sb = supabaseAdmin();
		const expire = new Date(nowMs + EXPIRATION_MINUTES * 60_000).toISOString();
		// Réessaie sur collision de référence (extrêmement rare — index unique).
		for (let essai = 0; essai < 5; essai++) {
			const reference = genererReference();
			const { data, error } = await sb
				.from('transactions')
				.insert({
					user_id: n.userId, montant: n.montant, credits: n.credits,
					statut: 'pending', psp: 'mobile_money', ref_externe: reference,
					reference, pays: n.pays, operateur: n.operateur, msisdn: n.msisdn, expire_le: expire
				})
				.select('*')
				.maybeSingle();
			if (!error && data) return rowToTx(data as Record<string, unknown>);
			if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`create tx: ${error.message}`);
		}
		throw new Error('create tx: collision de référence répétée');
	},
	async pendingForUser(userId: number): Promise<Transaction | null> {
		const sb = supabaseAdmin();
		const nowIso = new Date().toISOString();
		const { data } = await sb
			.from('transactions')
			.select('*')
			.eq('user_id', userId)
			.in('statut', ['initiated', 'pending'])
			.gt('expire_le', nowIso)
			.order('cree_le', { ascending: false })
			.limit(1)
			.maybeSingle();
		return data ? rowToTx(data as Record<string, unknown>) : null;
	},
	async get(reference: string): Promise<Transaction | null> {
		const sb = supabaseAdmin();
		const { data } = await sb.from('transactions').select('*').eq('reference', reference).maybeSingle();
		if (!data) return null;
		let t = rowToTx(data as Record<string, unknown>);
		// Expiration paresseuse : une transaction en attente au-delà du délai → expired.
		if ((t.statut === 'initiated' || t.statut === 'pending') && Date.now() >= t.expireLeMs) {
			await sbStore.expire(reference);
			t = { ...t, statut: 'expired' };
		}
		return t;
	},
	async confirm(reference: string): Promise<number> {
		const sb = supabaseAdmin();
		// La fonction SQL fait la transition conditionnelle + le crédit, en une fois.
		const { data, error } = await sb.rpc('confirmer_recharge', { p_reference: reference });
		if (error) throw new Error(`confirmer_recharge: ${error.message}`);
		return Number(data ?? 0);
	},
	async fail(reference: string): Promise<void> {
		const sb = supabaseAdmin();
		await sb.from('transactions').update({ statut: 'failed', maj_le: new Date().toISOString() })
			.eq('reference', reference).in('statut', ['initiated', 'pending']);
	},
	async expire(reference: string): Promise<void> {
		const sb = supabaseAdmin();
		await sb.from('transactions').update({ statut: 'expired', maj_le: new Date().toISOString() })
			.eq('reference', reference).in('statut', ['initiated', 'pending']);
	},
	async list(userId: number): Promise<Transaction[]> {
		const sb = supabaseAdmin();
		const { data } = await sb.from('transactions').select('*')
			.eq('user_id', userId).order('cree_le', { ascending: false }).limit(50);
		return ((data ?? []) as Record<string, unknown>[]).map(rowToTx);
	}
};

/* ------------------------------------------------------------------------ */
/*  Interface publique (bascule mémoire/Supabase)                            */
/* ------------------------------------------------------------------------ */

export async function creerTransaction(n: NouvelleTransaction): Promise<Transaction> {
	const nowMs = Date.now();
	return isSupabaseConfigured() ? sbStore.create(n, nowMs) : memStore.create(n, nowMs);
}

/** Transaction en cours de l'utilisateur (garde double-recharge), ou null. */
export async function rechargeEnCours(userId: number): Promise<Transaction | null> {
	return isSupabaseConfigured() ? sbStore.pendingForUser(userId) : memStore.pendingForUser(userId, Date.now());
}

export async function getTransaction(reference: string): Promise<Transaction | null> {
	return isSupabaseConfigured() ? sbStore.get(reference) : memStore.get(reference, Date.now());
}

export interface ConfirmationResultat {
	credite: number;
	/** Vrai si c'était une DOUBLE confirmation d'une transaction déjà réglée. */
	doubleConfirmation: boolean;
}

/**
 * Confirme une recharge : pose le crédit UNE fois. Idempotent. Journalise toute
 * DOUBLE confirmation (le jour où l'agrégateur confirme deux fois, on veut le voir).
 */
export async function confirmerRecharge(reference: string): Promise<ConfirmationResultat> {
	const credite = isSupabaseConfigured() ? await sbStore.confirm(reference) : await memStore.confirm(reference);
	if (credite > 0) return { credite, doubleConfirmation: false };
	// Aucun crédit posé : soit déjà réglée (double confirmation), soit référence inconnue.
	const t = await getTransaction(reference);
	const doubleConfirmation = t?.statut === 'success';
	if (doubleConfirmation) {
		console.warn(`[recharge] DOUBLE CONFIRMATION ignorée — reference=${reference} (crédit déjà posé une fois)`);
	}
	return { credite: 0, doubleConfirmation };
}

export async function echouerRecharge(reference: string): Promise<void> {
	return isSupabaseConfigured() ? sbStore.fail(reference) : memStore.fail(reference);
}

export async function expirerRecharge(reference: string): Promise<void> {
	return isSupabaseConfigured() ? sbStore.expire(reference) : memStore.expire(reference);
}

export async function listerTransactions(userId: number): Promise<Transaction[]> {
	return isSupabaseConfigured() ? sbStore.list(userId) : memStore.list(userId, Date.now());
}

/** Test/local : vide le magasin mémoire (jamais utilisé en production). */
export function _resetMem(): void {
	mem.clear();
}
