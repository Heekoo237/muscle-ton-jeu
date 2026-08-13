/**
 * rechargeStore.ts — Suivi des recharges en cours. Deux implémentations async :
 * Supabase (table `transactions`) si configuré, sinon en mémoire.
 *
 * Le crédit n'est posé qu'une fois, à la confirmation du paiement. La page de
 * retour (`retour`) n'est pas stockée ici : elle transite par l'URL d'attente.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { getUser } from './userStore';

export interface Recharge {
	credits: number;
	credited: boolean;
}

const mem = new Map<string, Recharge>();

export async function trackRecharge(
	txnId: string,
	data: { credits: number; montant: number }
): Promise<void> {
	if (!isSupabaseConfigured()) {
		mem.set(txnId, { credits: data.credits, credited: false });
		return;
	}
	const sb = supabaseAdmin();
	const u = await getUser();
	await sb.from('transactions').insert({
		user_id: u.id,
		montant: data.montant,
		credits: data.credits,
		statut: 'pending',
		psp: 'mtj',
		ref_externe: txnId
	});
}

export async function getRecharge(txnId: string): Promise<Recharge | undefined> {
	if (!isSupabaseConfigured()) return mem.get(txnId);
	const sb = supabaseAdmin();
	const { data } = await sb
		.from('transactions')
		.select('credits, statut')
		.eq('ref_externe', txnId)
		.maybeSingle();
	if (!data) return undefined;
	return { credits: Number(data.credits), credited: data.statut === 'success' };
}

export async function markCredited(txnId: string): Promise<void> {
	if (!isSupabaseConfigured()) {
		const p = mem.get(txnId);
		if (p) p.credited = true;
		return;
	}
	const sb = supabaseAdmin();
	await sb.from('transactions').update({ statut: 'success' }).eq('ref_externe', txnId);
}
