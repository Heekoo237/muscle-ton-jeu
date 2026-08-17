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
import { meterQuery } from './dbmeter';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
	return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Instrumente le client : chaque `.from(table)` / `.rpc(fn)` est COMPTÉ (dbmeter)
 * pour la requête HTTP courante. Le comptage est le seul ajout — le comportement
 * du client ne change pas. Sert au garde-fou « trop de requêtes par page ».
 */
function instrument(c: SupabaseClient): SupabaseClient {
	return new Proxy(c, {
		get(target, prop, receiver) {
			if (prop === 'from') {
				return (table: string) => {
					meterQuery(table);
					return target.from(table);
				};
			}
			if (prop === 'rpc') {
				return (fn: string, ...args: unknown[]) => {
					meterQuery(`rpc:${fn}`);
					return (target.rpc as (...a: unknown[]) => unknown)(fn, ...args);
				};
			}
			return Reflect.get(target, prop, receiver);
		}
	}) as SupabaseClient;
}

/** Client admin (service_role). Lève si la configuration est absente. */
export function supabaseAdmin(): SupabaseClient {
	if (!isSupabaseConfigured()) {
		throw new Error('Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
	}
	if (!client) {
		client = instrument(
			createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
				auth: { persistSession: false, autoRefreshToken: false }
			})
		);
	}
	return client;
}
