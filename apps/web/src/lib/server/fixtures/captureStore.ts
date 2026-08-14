/**
 * captureStore.ts — Empreinte des captures, réutilisation sous 24 h, stockage et
 * purge. Les captures sont sensibles (tickets de paris) : on stocke le strict
 * nécessaire, dans un bucket privé, et on PURGE après 30 jours.
 *
 * L'empreinte (SHA-256 des octets) sert deux choses :
 *  - dédoublonnage : deux fois la même capture ne relance pas d'analyse ;
 *  - réseau coupé pendant la lecture : au retour, même empreinte → même ticket,
 *    l'analyse n'est PAS rejouée (et le crédit n'est pas repris).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { getTicket, type StoredTicket } from './ticketStore';
import type { ImageInput } from '$lib/server/services/vision';

const BUCKET = 'captures';
const PURGE_DAYS = 30;

/** SHA-256 (hex) d'un buffer d'octets. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Empreinte combinée d'un lot de captures (indépendante de l'ordre des slots). */
export async function combinedEmpreinte(hashes: string[]): Promise<string> {
	const joined = [...hashes].sort().join('|');
	return sha256Hex(new TextEncoder().encode(joined));
}

/**
 * Ticket récent (≤ withinHours) de MÊME empreinte pour cet utilisateur, s'il
 * existe. Sert la réutilisation (renvoi / réseau coupé) et la gratuité 24 h.
 * Anonyme (userId null) : pas de réutilisation (l'essai n'est pas rattaché).
 */
export async function findRecentTicketByEmpreinte(
	userId: number | null,
	empreinte: string,
	withinHours = 24
): Promise<StoredTicket | null> {
	if (userId == null || !isSupabaseConfigured()) return null;
	const since = new Date(Date.now() - withinHours * 3600_000).toISOString();
	const { data } = await supabaseAdmin()
		.from('tickets')
		.select('id')
		.eq('user_id', userId)
		.eq('empreinte', empreinte)
		.gte('cree_le', since)
		.order('cree_le', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (!data) return null;
	return (await getTicket(String(data.id))) ?? null;
}

/**
 * Stocke les captures d'un ticket dans le bucket privé, avec une date de purge à
 * 30 jours. Best-effort : un échec de stockage ne casse jamais l'analyse (le
 * résultat, lui, est déjà calculé et figé). Sans Supabase, on ne stocke rien.
 */
export async function storeCaptures(
	ticketId: string,
	images: ImageInput[],
	hashes: string[]
): Promise<void> {
	if (!isSupabaseConfigured() || images.length === 0) return;
	const sb = supabaseAdmin();
	const purgeApres = new Date(Date.now() + PURGE_DAYS * 24 * 3600_000).toISOString();
	const rows: Array<{ ticket_id: number; url: string; empreinte: string; purge_apres: string }> = [];

	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		const ext = img.mime.split('/')[1] || 'jpg';
		const path = `${ticketId}/${hashes[i]}.${ext}`;
		const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
		const { error } = await sb.storage
			.from(BUCKET)
			.upload(path, bytes, { contentType: img.mime, upsert: true });
		if (!error) rows.push({ ticket_id: Number(ticketId), url: path, empreinte: hashes[i], purge_apres: purgeApres });
	}
	if (rows.length) await sb.from('ticket_images').insert(rows);
}

/**
 * Purge les captures dont la date de purge est passée : supprime les objets du
 * bucket puis les lignes. Renvoie le nombre de captures purgées. À planifier
 * (cron) — voir README de l'app.
 */
export async function purgeExpiredCaptures(): Promise<number> {
	if (!isSupabaseConfigured()) return 0;
	const sb = supabaseAdmin();
	const { data } = await sb
		.from('ticket_images')
		.select('id, url')
		.lt('purge_apres', new Date().toISOString())
		.limit(1000);
	if (!data || data.length === 0) return 0;
	const paths = data.map((r) => String(r.url));
	await sb.storage.from(BUCKET).remove(paths);
	await sb.from('ticket_images').delete().in('id', data.map((r) => r.id));
	return data.length;
}
