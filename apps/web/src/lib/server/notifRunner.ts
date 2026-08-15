/**
 * notifRunner.ts — Adaptateurs SUPABASE des jobs de notification. La logique pure
 * (verdicts, idempotence, heures calmes) vit dans domain/notif-*. Ici, seulement
 * les requêtes et le câblage vers le service d'envoi.
 *
 * Le règlement LIT la base (gratuit) : il ne rappelle jamais le fournisseur de
 * scores — c'est le pipeline Python qui écrit les scores (règle d'archi n°4, un seul
 * service fournisseur). Le SEUL coût en crédits est ce rafraîchissement, journalisé
 * à part côté Python.
 */
import type { Selection, TicketResult } from '$lib/types';
import { supabaseAdmin } from '$lib/server/supabase';
import { notifications } from '$lib/server/services';
import { runSettlement, type SettlePorts, type TicketARegler, type SettleStats } from '$lib/server/domain/notif-settle';
import { buildMorningNotification } from '$lib/server/domain/notif-text';
import { enHeuresCalmes } from '$lib/server/domain/notif-schedule';
import type { FinalScore } from '$lib/server/domain/settle';

/** Réserve atomiquement une clé d'événement (une notif par événement, jamais deux). */
async function reserver(cle: string, userId: number, type: 'settle' | 'matin'): Promise<boolean> {
	const db = supabaseAdmin();
	const { data, error } = await db.rpc('reserver_notification', {
		p_cle: cle,
		p_user_id: userId,
		p_type: type
	});
	if (error) throw new Error(`reserver_notification: ${error.message}`);
	return data === true;
}

/** Sélections minimales d'un ticket (colonnes utiles au règlement + au texte). */
function rowToSel(r: Record<string, unknown>): Selection {
	return {
		ordre: Number(r.ordre),
		texteBrut: '',
		fixtureId: r.fixture_id == null ? null : Number(r.fixture_id),
		matchLabel: (r.match_label as string) ?? '',
		marche: (r.marche as Selection['marche']) ?? null,
		etatResolution: r.etat_resolution as Selection['etatResolution'],
		coteSaisie: null,
		probabilite: null,
		seuilFragile: null,
		fragile: Boolean(r.fragile),
		retireeDuRenforce: Boolean(r.retiree_du_renforce),
		libelleFr: ''
	};
}

/** Nombre de jours en arrière où l'on cherche des tickets à régler. Un ticket dont
 *  tous les matchs sont plus vieux que ça est réglé depuis longtemps. Borne la charge. */
const REGLEMENT_FENETRE_JOURS = 7;

/**
 * Tickets analysés d'un utilisateur, PAS ENCORE NOTIFIÉS (suivi de résultat), sur
 * une fenêtre récente. On EXCLUT par `notifications_sent`, pas par `resultat` : une
 * notification retenue par les heures calmes (résultat déjà posé, envoi différé)
 * doit rester candidate jusqu'à ce qu'elle parte — sinon elle serait perdue.
 */
async function pendingSettleTickets(nowMs: number): Promise<TicketARegler[]> {
	const db = supabaseAdmin();
	const cutoff = new Date(nowMs - REGLEMENT_FENETRE_JOURS * 86_400_000).toISOString();
	const { data: tks, error } = await db
		.from('tickets')
		.select('id, user_id')
		.eq('statut', 'analyse')
		.not('user_id', 'is', null)
		.gte('cree_le', cutoff)
		.limit(500);
	if (error) throw new Error(`pendingSettleTickets: ${error.message}`);
	let rows = (tks ?? []) as { id: number; user_id: number }[];
	if (rows.length === 0) return [];

	// Retire ceux dont le suivi de résultat a DÉJÀ été envoyé (idempotence au niveau requête).
	const cles = rows.map((t) => `settle:${t.id}`);
	const { data: envoyes } = await db.from('notifications_sent').select('cle').in('cle', cles);
	const dejaEnvoye = new Set(((envoyes ?? []) as { cle: string }[]).map((r) => r.cle));
	rows = rows.filter((t) => !dejaEnvoye.has(`settle:${t.id}`));
	if (rows.length === 0) return [];

	const ids = rows.map((t) => t.id);
	const { data: sels } = await db
		.from('selections')
		.select('ticket_id, ordre, fixture_id, match_label, marche, etat_resolution, fragile, retiree_du_renforce')
		.in('ticket_id', ids);
	const parTicket = new Map<number, Selection[]>();
	for (const r of (sels ?? []) as Record<string, unknown>[]) {
		const tid = Number(r.ticket_id);
		if (!parTicket.has(tid)) parTicket.set(tid, []);
		parTicket.get(tid)!.push(rowToSel(r));
	}
	return rows.map((t) => ({ id: t.id, userId: t.user_id, selections: parTicket.get(t.id) ?? [] }));
}

function supabaseSettlePorts(origin: string): SettlePorts {
	const db = supabaseAdmin();
	return {
		async scoresFor(fixtureIds) {
			const out = new Map<number, FinalScore>();
			if (fixtureIds.length === 0) return out;
			const { data } = await db
				.from('fixtures')
				.select('id, score_home, score_away, statut')
				.in('id', fixtureIds)
				.eq('statut', 'finished');
			for (const f of (data ?? []) as Record<string, unknown>[]) {
				if (f.score_home != null && f.score_away != null) {
					out.set(Number(f.id), { home: Number(f.score_home), away: Number(f.score_away) });
				}
			}
			return out;
		},
		reserver,
		notify: (userId, payload) => notifications.notify(userId, payload),
		async poserResultat(ticketId, resultat: TicketResult) {
			// Idempotent : on ne réécrit pas un ticket déjà réglé.
			await db.from('tickets').update({ resultat }).eq('id', ticketId).is('resultat', null);
		},
		urlTicket: (id) => `${origin}/dashboard/historique/${id}`
	};
}

/** Job de règlement : règle les tickets terminés et notifie (une fois, hors nuit). */
export async function runSettleJob(origin: string, nowMs: number): Promise<SettleStats> {
	const tickets = await pendingSettleTickets(nowMs);
	return runSettlement(tickets, supabaseSettlePorts(origin), nowMs);
}

export interface MorningStats {
	matchsAujourdhui: number;
	eligibles: number;
	notifies: number;
}

/**
 * Rendez-vous du matin. N'envoie QU'aux utilisateurs pour qui une analyse offerte
 * est RÉELLEMENT disponible (premier ticket non utilisé) — sinon promesse fausse.
 * Et seulement les jours où il y a des matchs. Idempotent par (user, jour local).
 */
export async function runMorningJob(origin: string, nowMs: number): Promise<MorningStats> {
	const db = supabaseAdmin();
	// Jour LOCAL (UTC+1) pour la fenêtre « matchs du jour » et la clé d'idempotence.
	const localMidnight = new Date(nowMs + 3600_000);
	const jour = localMidnight.toISOString().slice(0, 10);
	const debut = `${jour}T00:00:00Z`;
	const fin = `${jour}T23:59:59Z`;

	const { count: matchs } = await db
		.from('fixtures')
		.select('id', { count: 'exact', head: true })
		.eq('statut', 'scheduled')
		.gte('date_utc', debut)
		.lte('date_utc', fin);
	const matchsAujourdhui = matchs ?? 0;
	if (matchsAujourdhui === 0) return { matchsAujourdhui: 0, eligibles: 0, notifies: 0 };
	if (enHeuresCalmes(nowMs)) return { matchsAujourdhui, eligibles: 0, notifies: 0 }; // garde-fou

	// Éligibles : analyse offerte DISPONIBLE (premier ticket non utilisé) ET abonnés.
	const { data: abonnes } = await db.from('push_subscriptions').select('user_id');
	const userIds = [...new Set(((abonnes ?? []) as { user_id: number }[]).map((a) => a.user_id))];
	if (userIds.length === 0) return { matchsAujourdhui, eligibles: 0, notifies: 0 };

	const { data: users } = await db
		.from('users')
		.select('id')
		.eq('premier_ticket_utilise', false)
		.in('id', userIds);
	const eligibles = ((users ?? []) as { id: number }[]).map((u) => u.id);

	const payload = buildMorningNotification(`${origin}/analyser`);
	let notifies = 0;
	for (const uid of eligibles) {
		const pris = await reserver(`matin:${uid}:${jour}`, uid, 'matin');
		if (!pris) continue;
		await notifications.notify(uid, payload);
		notifies++;
	}
	return { matchsAujourdhui, eligibles: eligibles.length, notifies };
}
