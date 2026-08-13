/**
 * shareStore.ts — Liens de partage courts et uniques. Un code opaque par ticket
 * (idempotent) qui pointe vers une page publique. Le code n'expose AUCUNE donnée
 * de compte : ni prénom, ni avatar, ni email, ni historique — juste l'image.
 *
 * Supabase (table `shares`) si configuré, sinon en mémoire (local).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Code court aléatoire (8 caractères base62, ~2e14 combinaisons). */
function newCode(): string {
	const b = new Uint8Array(8);
	crypto.getRandomValues(b);
	let s = '';
	for (let i = 0; i < 8; i++) s += B62[b[i] % 62];
	return s;
}

const memByTicket = new Map<string, string>();
const memByCode = new Map<string, string>();

/** Renvoie (en le créant au besoin) le code de partage d'un ticket. */
export async function getOrCreateShareCode(ticketId: string): Promise<string> {
	if (!isSupabaseConfigured()) {
		const existing = memByTicket.get(ticketId);
		if (existing) return existing;
		const code = newCode();
		memByTicket.set(ticketId, code);
		memByCode.set(code, ticketId);
		return code;
	}
	const sb = supabaseAdmin();
	const { data: found } = await sb
		.from('shares')
		.select('code')
		.eq('ticket_id', Number(ticketId))
		.maybeSingle();
	if (found?.code) return found.code as string;

	// Création avec quelques tentatives en cas de collision de code (très rare).
	for (let i = 0; i < 5; i++) {
		const code = newCode();
		const { error } = await sb.from('shares').insert({ code, ticket_id: Number(ticketId) });
		if (!error) return code;
	}
	throw new Error('Impossible de générer un lien de partage.');
}

/** Résout un code de partage en identifiant de ticket, ou null. */
export async function resolveShareCode(code: string): Promise<string | null> {
	if (!isSupabaseConfigured()) return memByCode.get(code) ?? null;
	const { data } = await supabaseAdmin()
		.from('shares')
		.select('ticket_id')
		.eq('code', code)
		.maybeSingle();
	return data ? String(data.ticket_id) : null;
}
