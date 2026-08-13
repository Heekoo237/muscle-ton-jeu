/**
 * offeredDeviceStore.ts — Empreintes d'appareil ayant déjà consommé le ticket
 * offert. Marqueur INDICATIF, jamais bloquant pour l'usage payant : un
 * utilisateur peut toujours recharger et analyser (PRD, session auth).
 *
 * Deux implémentations derrière la même interface : Supabase (table
 * offered_devices) si configuré, sinon un ensemble en mémoire (local).
 *
 * Principe de sûreté : en cas d'erreur ou de table absente, on « échoue ouvert »
 * (on n'a rien consommé) — mieux vaut accorder un ticket offert que bloquer à
 * tort un utilisateur légitime. L'empreinte n'est pas une barrière dure.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

const memDevices = new Set<string>();

/** L'empreinte a-t-elle déjà consommé un ticket offert ? */
export async function hasConsumedOffer(fingerprint: string): Promise<boolean> {
	if (!fingerprint) return false;
	if (!isSupabaseConfigured()) return memDevices.has(fingerprint);
	try {
		const { data } = await supabaseAdmin()
			.from('offered_devices')
			.select('fingerprint')
			.eq('fingerprint', fingerprint)
			.maybeSingle();
		return Boolean(data);
	} catch {
		return false; // échec ouvert : ne jamais bloquer sur une erreur d'infra
	}
}

/** Marque l'empreinte comme ayant consommé le ticket offert (idempotent). */
export async function recordOfferConsumed(fingerprint: string): Promise<void> {
	if (!fingerprint) return;
	if (!isSupabaseConfigured()) {
		memDevices.add(fingerprint);
		return;
	}
	try {
		await supabaseAdmin()
			.from('offered_devices')
			.upsert({ fingerprint }, { onConflict: 'fingerprint' });
	} catch {
		// sans effet : l'empreinte reste indicative
	}
}
