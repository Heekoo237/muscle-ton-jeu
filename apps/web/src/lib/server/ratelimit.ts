/**
 * ratelimit.ts — Limitation de débit partagée (C1). Fenêtre fixe atomique en base
 * (`hit_rate_limit`, migration 0015), donc valable entre toutes les instances
 * serverless. Borne les endpoints coûteux — d'abord l'appel vision de /analyser,
 * non authentifié et sans limite jusqu'ici.
 *
 * FAIL-OPEN : si le limiteur lui-même échoue (RPC en erreur), on LAISSE PASSER. On
 * ne bloque jamais un utilisateur légitime sur une panne du garde-fou — la
 * disponibilité prime, l'incident est journalisé.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

/** Réglages nommés (pas de nombres en dur au point d'appel). */
export const RATE_LIMITS = {
	/** Appel vision de /analyser : ~$ par appel, non authentifié. */
	analyserIp: { fenetreS: 600, max: 15 }, // 15 soumissions / 10 min / IP
	analyserCompte: { fenetreS: 3600, max: 20 }, // 20 / heure / compte
	/**
	 * Image de partage publique : la rasterisation resvg est LOURDE en CPU et
	 * l'endpoint est non authentifié (og:image). Le cache CDN absorbe le trafic
	 * légitime (immutable, 24 h) ; cette borne coupe le martèlement d'un tiers qui
	 * ferait rendre en boucle des codes variés depuis une même IP.
	 */
	imagePartageIp: { fenetreS: 60, max: 30 } // 30 rendus / min / IP
} as const;

/** True = requête AUTORISÉE. En local/factice (sans Supabase), pas de limite. */
export async function rateLimit(cle: string, fenetreS: number, max: number): Promise<boolean> {
	if (!isSupabaseConfigured()) return true;
	try {
		const { data, error } = await supabaseAdmin().rpc('hit_rate_limit', {
			p_cle: cle,
			p_fenetre_s: fenetreS,
			p_max: max
		});
		if (error) {
			console.error('[ratelimit] RPC en erreur — on laisse passer', error);
			return true;
		}
		return data === true;
	} catch (e) {
		console.error('[ratelimit] exception — on laisse passer', e);
		return true;
	}
}
