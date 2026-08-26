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
import { selectAll } from '$lib/server/supabasePage';
import { notifications } from '$lib/server/services';
import { runSettlement, type SettlePorts, type TicketARegler, type SettleStats } from '$lib/server/domain/notif-settle';
import { settleTicket, fixtureFlipSuspect } from '$lib/server/domain/settle';
import { buildMorningNotification } from '$lib/server/domain/notif-text';
import { ANALYSES_OFFERTES } from '$lib/offer';
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
		equipeDomId: r.equipe_dom_id == null ? null : Number(r.equipe_dom_id),
		equipeExtId: r.equipe_ext_id == null ? null : Number(r.equipe_ext_id),
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
	// Paginé : ces tickets × leurs sélections peuvent dépasser 1000 lignes — une
	// sélection manquante fausserait le verdict de son ticket.
	const sels = await selectAll<Record<string, unknown>>(() =>
		db
			.from('selections')
			.select('ticket_id, ordre, fixture_id, match_label, equipe_dom_id, equipe_ext_id, marche, etat_resolution, fragile, retiree_du_renforce')
			.in('ticket_id', ids)
			.order('id', { ascending: true })
	);
	const parTicket = new Map<number, Selection[]>();
	for (const r of sels) {
		const tid = Number(r.ticket_id);
		if (!parTicket.has(tid)) parTicket.set(tid, []);
		parTicket.get(tid)!.push(rowToSel(r));
	}
	return rows.map((t) => ({ id: t.id, userId: t.user_id, selections: parTicket.get(t.id) ?? [] }));
}

/**
 * Fixtures RETOURNÉS parmi ceux fournis : la DC modèle (orientée fixture) contredit
 * le 1X2 coté (orienté fournisseur). Lecture SEULE de predictions. Sert au garde du
 * règlement : une sélection SANS snapshot sur l'un d'eux n'est pas réglée.
 */
async function flipSuspectsDepuisBase(
	db: ReturnType<typeof supabaseAdmin>,
	fixtureIds: number[]
): Promise<Set<number>> {
	const out = new Set<number>();
	if (fixtureIds.length === 0) return out;
	const { data } = await db
		.from('predictions')
		.select('fixture_id, marche, probabilite, source, jour_calcul')
		.in('fixture_id', fixtureIds)
		.in('marche', ['WIN_HOME', 'DRAW', 'DC_HOME_DRAW'])
		.order('jour_calcul', { ascending: false });
	// Dernière valeur par (fixture, marché).
	const vu = new Map<number, Set<string>>();
	const val = new Map<number, { wh: number | null; dr: number | null; dc: number | null; dcSrc: string | null }>();
	for (const r of (data ?? []) as Record<string, unknown>[]) {
		const fid = Number(r.fixture_id);
		const marche = String(r.marche);
		let m = vu.get(fid);
		if (!m) { m = new Set(); vu.set(fid, m); }
		if (m.has(marche)) continue;
		m.add(marche);
		const v = val.get(fid) ?? { wh: null, dr: null, dc: null, dcSrc: null };
		const p = Number(r.probabilite);
		if (marche === 'WIN_HOME') v.wh = p;
		else if (marche === 'DRAW') v.dr = p;
		else if (marche === 'DC_HOME_DRAW') { v.dc = p; v.dcSrc = r.source == null ? null : String(r.source); }
		val.set(fid, v);
	}
	for (const [fid, v] of val) {
		const dcModel = v.dcSrc === 'model' ? v.dc : null; // DC dérivée d'une cote ≠ flip
		if (fixtureFlipSuspect(dcModel, v.wh, v.dr)) out.add(fid);
	}
	return out;
}

function supabaseSettlePorts(origin: string): SettlePorts {
	const db = supabaseAdmin();
	return {
		flipSuspectsFor: (fixtureIds) => flipSuspectsDepuisBase(db, fixtureIds),
		async scoresFor(fixtureIds) {
			const out = new Map<number, FinalScore>();
			if (fixtureIds.length === 0) return out;
			const { data } = await db
				.from('fixtures')
				.select('id, score_home, score_away, statut, team_home_id')
				.in('id', fixtureIds)
				.eq('statut', 'finished');
			for (const f of (data ?? []) as Record<string, unknown>[]) {
				if (f.score_home != null && f.score_away != null) {
					out.set(Number(f.id), {
						home: Number(f.score_home),
						away: Number(f.score_away),
						// Orientation courante : le règlement permute si la sélection a figé l'autre.
						homeTeamId: f.team_home_id == null ? null : Number(f.team_home_id)
					});
				}
			}
			return out;
		},
		reserver,
		notify: (userId, payload) => notifications.notify(userId, payload),
		async poserResultat(ticketId, renforce: TicketResult, originale: TicketResult) {
			// Idempotent : on ne réécrit pas un ticket déjà réglé. Les deux verdicts sont
			// posés ensemble, dans le même UPDATE gardé par `resultat IS NULL`.
			await db
				.from('tickets')
				.update({ resultat: renforce, resultat_originale: originale })
				.eq('id', ticketId)
				.is('resultat', null);
		},
		urlTicket: (id) => `${origin}/dashboard/historique/${id}`
	};
}

/** Job de règlement : règle les tickets terminés et notifie (une fois, hors nuit). */
export async function runSettleJob(origin: string, nowMs: number): Promise<SettleStats> {
	const tickets = await pendingSettleTickets(nowMs);
	return runSettlement(tickets, supabaseSettlePorts(origin), nowMs);
}

export interface BackfillStats {
	candidats: number;
	regles: number;
	enAttente: number;
	sansReglable: number;
}

/**
 * BACKFILL de règlement — rattrapage UNIQUE de la dette. Le job régulier ne regarde
 * que les tickets de moins de 7 jours (borne de charge) : les tickets plus vieux dont
 * les matchs sont terminés ne se règlent jamais tout seuls. Ici on pose le verdict pour
 * TOUS les tickets analysés non réglés, SANS borne d'âge.
 *
 * SILENCIEUX : on ne notifie PAS (un push « ton ticket est tombé » pour un match d'il y
 * a huit jours n'a aucun sens). Les tickets récents encore dans la fenêtre seront, eux,
 * notifiés normalement par le job régulier — on ne réserve donc pas leur clé ici.
 * IDEMPOTENT : `poserResultat` est gardé par `resultat IS NULL` ; relancer ne réécrit rien.
 */
export async function runBackfillJob(nowMs: number): Promise<BackfillStats> {
	const db = supabaseAdmin();
	// Paginé : rattrapage sur TOUS les tickets analysés non réglés (`.limit(5000)` était
	// trompeur — plafonné à 1000 par le serveur). Idempotent, mais on veut tout couvrir
	// en une passe.
	const rows = await selectAll<{ id: number; user_id: number | null }>(() =>
		db.from('tickets').select('id, user_id').eq('statut', 'analyse').is('resultat', null).order('id', { ascending: true })
	);
	if (rows.length === 0) return { candidats: 0, regles: 0, enAttente: 0, sansReglable: 0 };

	const ids = rows.map((t) => t.id);
	const sels = await selectAll<Record<string, unknown>>(() =>
		db
			.from('selections')
			.select('ticket_id, ordre, fixture_id, match_label, equipe_dom_id, equipe_ext_id, marche, etat_resolution, fragile, retiree_du_renforce')
			.in('ticket_id', ids)
			.order('id', { ascending: true })
	);
	const parTicket = new Map<number, Selection[]>();
	for (const r of sels) {
		const tid = Number(r.ticket_id);
		if (!parTicket.has(tid)) parTicket.set(tid, []);
		parTicket.get(tid)!.push(rowToSel(r));
	}

	const ports = supabaseSettlePorts(''); // seuls scoresFor + poserResultat servent ici
	const stats: BackfillStats = { candidats: rows.length, regles: 0, enAttente: 0, sansReglable: 0 };
	for (const t of rows) {
		const selections = parTicket.get(t.id) ?? [];
		const fixtureIds = [
			...new Set(selections.map((s) => s.fixtureId).filter((x): x is number => x !== null))
		];
		const scores = await ports.scoresFor(fixtureIds);
		const flip = await ports.flipSuspectsFor(fixtureIds);
		const v = settleTicket(selections, scores, flip);
		if (v.retenues.length > 0) {
			console.warn(
				`[backfill] ORIENTATION INCERTAINE ticket ${t.id} — ${v.retenues.length} ` +
					`sélection(s) sans snapshot sur un fixture retourné : NON réglé, laissé en attente.`
			);
		}
		if (v.originale === 'en_attente') {
			// Distingue « un score manque encore » de « rien de réglable ici ».
			if (selections.some((s) => s.etatResolution === 'certain' && s.marche !== null && s.fixtureId !== null))
				stats.enAttente++;
			else stats.sansReglable++;
			continue;
		}
		await ports.poserResultat(t.id, v.renforce, v.originale);
		stats.regles++;
	}
	return stats;
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
	// Paginé : sur 30 jours, le nombre d'utilisateurs actifs peut dépasser 1000.
	const recents = await selectAll<{ user_id: number }>(() =>
		db
			.from('tickets')
			.select('user_id')
			.eq('statut', 'analyse')
			.not('user_id', 'is', null)
			.gte('cree_le', cutoff)
			.order('id', { ascending: true })
	);
	const actifs = new Set(recents.map((t) => t.user_id));
	if (actifs.size === 0) return { matchs24h, eligibles: 0, notifies: 0 };

	// 3) …ET abonnés.
	const { data: abonnes } = await db.from('push_subscriptions').select('user_id').in('user_id', [...actifs]);
	const eligibles = [...new Set(((abonnes ?? []) as { user_id: number }[]).map((a) => a.user_id))];
	if (eligibles.length === 0) return { matchs24h, eligibles: 0, notifies: 0 };

	// Variante de texte selon la gratuité RÉELLE (des analyses offertes restent-elles ?).
	const { data: users } = await db
		.from('users')
		.select('id, analyses_offertes_utilisees')
		.in('id', eligibles);
	const offreDispo = new Map(
		((users ?? []) as { id: number; analyses_offertes_utilisees: number | null }[]).map((u) => [
			u.id,
			(u.analyses_offertes_utilisees ?? 0) < ANALYSES_OFFERTES
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
