// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			/** Client Supabase SSR de la requête, ou null si Supabase n'est pas configuré. */
			supabase: SupabaseClient | null;
			/** Session Auth validée (getUser côté serveur). */
			safeGetSession: () => Promise<{ user: User | null }>;
			/**
			 * Cache PAR REQUÊTE de la session applicative. Les trois `load` d'une page
			 * (layout app, layout dashboard, page) appelaient `getAppSession` chacun —
			 * soit 3× `auth.getUser` + 3× lecture `users`. On résout une seule fois et on
			 * réutilise la promesse (dédoublonnage concurrent).
			 */
			appSession?: Promise<import('$lib/server/session').AppSession | null>;
			/**
			 * Cache PAR REQUÊTE de `hasRecharged`. Le layout (bandeau crédits) ET la page
			 * résultat (invitation à recharger) le demandent : sans cache, deux `count`
			 * pour la même réponse. On résout une fois, on réutilise la promesse.
			 */
			rechargeMemo?: Promise<boolean>;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
