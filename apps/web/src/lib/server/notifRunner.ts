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
	matchs24h: number;
	eligibles: number;
	notifies: number;
}

/** Jours d'inactivité au-delà desquels on ne réveille plus un compte (il a décroché). */
const MATIN_ACTIF_JOURS = 30;

/**
 * Rendez-vous du matin. Conditions d'envoi :
 *  1. il y a des matchs dans les PROCHAINES 24 h ;
 *  2. l'utilisateur est ACTIF (a analysé ≥ 1 ticket dans les 30 derniers jours) —
 *     on ne réveille pas quelqu'un qui a décroché ;
 *  3. il est abonné aux notifications.
 * Le TEXTE dépend de la gratuité RÉELLE : première analyse offerte (premier ticket
 * non utilisé) → variante « offerte » ; sinon message utile sans promesse.
 * Idempotent par (utilisateur, jour local).
 */
export async function runMorningJob(origin: string, nowMs: number): Promise<MorningStats> {
	const db = supabaseAdmin();
	const nowIso = new Date(nowMs).toISOString();
	const dans24h = new Date(nowMs + 24 * 3600_000).toISOString();
	const jour = new Date(nowMs + 3600_000).toISOString().slice(0, 10); // jour LOCAL (UTC+1)

	// 1) Des matchs dans les prochaines 24 h ?
	const { count: matchs } = await db
		.from('fixtures')
		.select('id', { count: 'exact', head: true })
		.eq('statut', 'scheduled')
		.gte('date_utc', nowIso)
		.lte('date_utc', dans24h);
	const matchs24h = matchs ?? 0;
	if (matchs24h === 0) return { matchs24h: 0, eligibles: 0, notifies: 0 };
	if (enHeuresCalmes(nowMs)) return { matchs24h, eligibles: 0, notifies: 0 }; // garde-fou

	// 2) Utilisateurs ACTIFS : au moins un ticket analysé dans les 30 derniers jours.
	const cutoff = new Date(nowMs - MATIN_ACTIF_JOURS * 86_400_000).toISOString();
	const { data: recents } = await db
		.from('tickets')
		.select('user_id')
		.eq('statut', 'analyse')
		.not('user_id', 'is', null)
		.gte('cree_le', cutoff);
	const actifs = new Set(((recents ?? []) as { user_id: number }[]).map((t) => t.user_id));
	if (actifs.size === 0) return { matchs24h, eligibles: 0, notifies: 0 };

	// 3) …ET abonnés.
	const { data: abonnes } = await db.from('push_subscriptions').select('user_id').in('user_id', [...actifs]);
	const eligibles = [...new Set(((abonnes ?? []) as { user_id: number }[]).map((a) => a.user_id))];
	if (eligibles.length === 0) return { matchs24h, eligibles: 0, notifies: 0 };

	// Variante de texte selon la gratuité RÉELLE (premier ticket encore disponible ?).
	const { data: users } = await db.from('users').select('id, premier_ticket_utilise').in('id', eligibles);
	const offreDispo = new Map(
		((users ?? []) as { id: number; premier_ticket_utilise: boolean }[]).map((u) => [
			u.id,
			u.premier_ticket_utilise === false
		])
	);

	const url = `${origin}/analyser`;
	let notifies = 0;
	for (const uid of eligibles) {
		const pris = await reserver(`matin:${uid}:${jour}`, uid, 'matin');
		if (!pris) continue;
		await notifications.notify(uid, buildMorningNotification(offreDispo.get(uid) ?? false, url));
		notifies++;
	}
	return { matchs24h, eligibles: eligibles.length, notifies };
}
