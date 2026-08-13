// See https://svelte.dev/docs/kit/types#app.d.ts
import type { SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			/** Client Supabase SSR de la requête, ou null si Supabase n'est pas configuré. */
			supabase: SupabaseClient | null;
			/** Session Auth validée (getUser côté serveur). */
			safeGetSession: () => Promise<{ user: User | null }>;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
