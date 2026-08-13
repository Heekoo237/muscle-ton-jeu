/**
 * supabase.ts — Client Supabase côté SERVEUR (clé service_role).
 *
 * Règle d'archi n°8 : l'accès aux données passe par le serveur ; le RLS est une
 * défense en profondeur, jamais le mécanisme principal. On n'expose JAMAIS la
 * clé service_role au navigateur.
 *
 * Tant que les variables d'environnement Supabase sont absentes, `isConfigured`
 * est faux et le produit reste sur les magasins factices en mémoire. Brancher
 * Supabase = renseigner les variables, aucune refonte.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
	return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Client admin (service_role). Lève si la configuration est absente. */
export function supabaseAdmin(): SupabaseClient {
	if (!isSupabaseConfigured()) {
		throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
	}
	if (!client) {
		client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
			auth: { persistSession: false, autoRefreshToken: false }
		});
	}
	return client;
}
