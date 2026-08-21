/**
 * ticketDeletion.ts — Suppression d'une analyse par l'utilisateur, par ANONYMISATION
 * SUR PLACE (jamais un hard-delete). Voir migration 0024 pour le raisonnement complet.
 *
 * Trois effets, dans cet ordre (le plus destructeur — la capture — d'abord) :
 *   1) purge de la capture (objets du bucket + lignes ticket_images) ;
 *   2) user_id → NULL + supprime_le = now() (le lien personnel est ROMPU) ;
 * de sorte que la ligne quitte l'historique PRIVÉ (listAnalysedTickets filtre user_id
 * = moi) mais RESTE dans l'historique public / les agrégats — qui ne lisent jamais
 * l'utilisateur. Les crédits ne sont JAMAIS touchés (la suppression est un geste
 * d'affichage, l'analyse a bien été rendue).
 *
 * Sécurité : on n'anonymise QUE si le ticket appartient encore à l'appelant
 * (`.eq('user_id', userId)`), ce qui rend aussi l'opération idempotente (un second
 * appel ne trouve plus rien à faire).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { getTicket } from './ticketStore';
import { purgeTicketCaptures } from './captureStore';

export type SuppressionResultat =
	| { ok: true }
	| { ok: false; raison: 'introuvable' | 'pas_le_proprietaire' };

export async function supprimerTicket(ticketId: string, userId: number): Promise<SuppressionResultat> {
	// Vérif de propriété AVANT toute écriture : on n'efface jamais le ticket d'autrui.
	const ticket = await getTicket(ticketId);
	if (!ticket) return { ok: false, raison: 'introuvable' };
	if (ticket.userId == null || ticket.userId !== userId) return { ok: false, raison: 'pas_le_proprietaire' };

	if (!isSupabaseConfigured()) return { ok: true }; // local/mémoire : rien à anonymiser

	// 1) Capture d'abord (best-effort : ne lève pas).
	await purgeTicketCaptures(ticketId);

	// 2) Rompre le lien personnel. Le garde `user_id = userId` = propriété + idempotence.
	const sb = supabaseAdmin();
	const { error } = await sb
		.from('tickets')
		.update({ user_id: null, supprime_le: new Date().toISOString() })
		.eq('id', Number(ticketId))
		.eq('user_id', userId);
	if (error) throw new Error(`supprimerTicket: ${error.message}`);
	return { ok: true };
}
