/**
 * ticketStore.ts — Magasin de tickets. Deux implémentations derrière la même
 * interface async : Supabase (persistant) si configuré, sinon en mémoire.
 *
 * Le ticket est sauvegardé DÈS la validation de lecture, avant tout paiement
 * (règle de facturation n°2). La persistance Supabase corrige la perte d'état
 * en serverless.
 */
import type { Market, Selection, TicketStatus } from '$lib/types';
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

export interface StoredResult {
	probaTotalePct: number;
	probaRenforceePct: number;
	nbRetirees: number;
	nbFragiles: number;
}

export interface StoredBilling {
	gratuit: boolean;
	credits: number;
}

export interface StoredTicket {
	id: string;
	statut: TicketStatus;
	selections: Selection[];
	creeLe: number;
	creeLeMs: number;
	result?: StoredResult;
	billing?: StoredBilling;
	/** Propriétaire ; null tant que le ticket est anonyme (avant connexion). */
	userId?: number | null;
}

/* ------------------------------------------------------------------------ */
/*  Implémentation en mémoire (repli local)                                  */
/* ------------------------------------------------------------------------ */
const memStore = new Map<string, StoredTicket>();
let memCounter = 0;

/* ------------------------------------------------------------------------ */
/*  Mappage Supabase                                                          */
/* ------------------------------------------------------------------------ */
type Row = Record<string, unknown>;

function selectionToRow(ticketId: number, s: Selection): Row {
	return {
		ticket_id: ticketId,
		fixture_id: s.fixtureId,
		marche: s.marche,
		etat_resolution: s.etatResolution,
		texte_brut: s.texteBrut,
		cote_saisie: s.coteSaisie,
		probabilite: s.probabilite,
		fragile: s.fragile,
		retiree_du_renforce: s.retireeDuRenforce,
		ordre: s.ordre,
		match_label: s.matchLabel,
		libelle_fr: s.libelleFr,
		raison: s.raison ?? null,
		candidates: s.candidates ?? null
	};
}

function rowToSelection(r: Row): Selection {
	const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
	return {
		ordre: Number(r.ordre),
		texteBrut: (r.texte_brut as string) ?? '',
		fixtureId: r.fixture_id === null || r.fixture_id === undefined ? null : Number(r.fixture_id),
		matchLabel: (r.match_label as string) ?? '',
		marche: (r.marche as Market | null) ?? null,
		etatResolution: r.etat_resolution as Selection['etatResolution'],
		raison: (r.raison as Selection['raison']) ?? undefined,
		candidates: (r.candidates as Market[] | null) ?? undefined,
		coteSaisie: num(r.cote_saisie),
		probabilite: num(r.probabilite),
		fragile: Boolean(r.fragile),
		retireeDuRenforce: Boolean(r.retiree_du_renforce),
		libelleFr: (r.libelle_fr as string) ?? ''
	};
}

function rowToTicket(t: Row, sels: Row[]): StoredTicket {
	const analyse = t.statut === 'analyse';
	const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
	const result: StoredResult | undefined = analyse
		? {
				probaTotalePct: Math.round(num(t.proba_totale) * 100 * 10) / 10,
				probaRenforceePct: Math.round(num(t.proba_renforcee) * 100 * 10) / 10,
				nbRetirees: num(t.nb_retirees),
				nbFragiles: num(t.nb_fragiles)
			}
		: undefined;
	const billing: StoredBilling | undefined = analyse
		? { gratuit: num(t.cout_credits) === 0, credits: num(t.cout_credits) }
		: undefined;
	return {
		id: String(t.id),
		statut: t.statut as TicketStatus,
		selections: sels.map(rowToSelection).sort((a, b) => a.ordre - b.ordre),
		creeLe: 0,
		creeLeMs: t.cree_le ? Date.parse(t.cree_le as string) : Date.now(),
		result,
		billing,
		userId: t.user_id === null || t.user_id === undefined ? null : Number(t.user_id)
	};
}

/* ------------------------------------------------------------------------ */
/*  Interface publique (async)                                               */
/* ------------------------------------------------------------------------ */
export async function createTicket(
	selections: Selection[],
	userId: number | null = null
): Promise<StoredTicket> {
	if (!isSupabaseConfigured()) {
		const id = `t_${++memCounter}_${selections.length}`;
		const ticket: StoredTicket = {
			id,
			statut: 'en_lecture',
			selections,
			creeLe: memCounter,
			creeLeMs: Date.now(),
			userId
		};
		memStore.set(id, ticket);
		return ticket;
	}
	const sb = supabaseAdmin();
	const { data: t, error } = await sb
		.from('tickets')
		.insert({ user_id: userId, statut: 'en_lecture', nb_selections: selections.length })
		.select('id, statut, cree_le')
		.single();
	if (error) throw error;
	if (selections.length) {
		const { error: se } = await sb
			.from('selections')
			.insert(selections.map((s) => selectionToRow(t.id, s)));
		if (se) throw se;
	}
	return rowToTicket(t, selections.map((s) => selectionToRow(t.id, s)));
}

export async function getTicket(id: string): Promise<StoredTicket | undefined> {
	if (!isSupabaseConfigured()) return memStore.get(id);
	const sb = supabaseAdmin();
	const { data: t } = await sb.from('tickets').select('*').eq('id', Number(id)).maybeSingle();
	if (!t) return undefined;
	const { data: sels } = await sb
		.from('selections')
		.select('*')
		.eq('ticket_id', Number(id))
		.order('ordre');
	return rowToTicket(t, sels ?? []);
}

export async function updateTicket(
	id: string,
	patch: Partial<StoredTicket>
): Promise<StoredTicket | undefined> {
	if (!isSupabaseConfigured()) {
		const t = memStore.get(id);
		if (!t) return undefined;
		const next = { ...t, ...patch };
		memStore.set(id, next);
		return next;
	}
	const sb = supabaseAdmin();
	const upd: Row = {};
	if (patch.statut) upd.statut = patch.statut;
	if (patch.userId !== undefined) upd.user_id = patch.userId;
	if (patch.billing) upd.cout_credits = patch.billing.credits;
	if (patch.result) {
		upd.proba_totale = patch.result.probaTotalePct / 100;
		upd.proba_renforcee = patch.result.probaRenforceePct / 100;
		upd.nb_fragiles = patch.result.nbFragiles;
		upd.nb_retirees = patch.result.nbRetirees;
		upd.analyse_le = new Date().toISOString();
	}
	if (Object.keys(upd).length) {
		await sb.from('tickets').update(upd).eq('id', Number(id));
	}
	if (patch.selections) {
		await sb.from('selections').delete().eq('ticket_id', Number(id));
		if (patch.selections.length) {
			await sb.from('selections').insert(patch.selections.map((s) => selectionToRow(Number(id), s)));
		}
	}
	return getTicket(id);
}

/* ------------------------------------------------------------------------ */
/*  Texte d'analyse — figé au moment de l'analyse, relu à vie (jamais refacturé) */
/* ------------------------------------------------------------------------ */
const memAnalyses = new Map<string, string>();

/** Fige le texte rédigé pour un ticket, tel qu'il a été rendu à l'utilisateur. */
export async function saveAnalysisText(ticketId: string, texte: string): Promise<void> {
	if (!isSupabaseConfigured()) {
		memAnalyses.set(ticketId, texte);
		return;
	}
	// Idempotent : une analyse par ticket (clé primaire ticket_id).
	await supabaseAdmin()
		.from('analyses')
		.upsert({ ticket_id: Number(ticketId), texte }, { onConflict: 'ticket_id' });
}

/** Relit le texte figé d'un ticket analysé (consultation d'historique). */
export async function getAnalysisText(ticketId: string): Promise<string | null> {
	if (!isSupabaseConfigured()) return memAnalyses.get(ticketId) ?? null;
	const { data } = await supabaseAdmin()
		.from('analyses')
		.select('texte')
		.eq('ticket_id', Number(ticketId))
		.maybeSingle();
	return (data?.texte as string) ?? null;
}

export async function listAnalysedTickets(userId: number): Promise<StoredTicket[]> {
	if (!isSupabaseConfigured()) {
		return [...memStore.values()]
			.filter((t) => t.statut === 'analyse')
			.sort((a, b) => b.creeLe - a.creeLe);
	}
	const sb = supabaseAdmin();
	const { data: rows } = await sb
		.from('tickets')
		.select('*, selections(*)')
		.eq('user_id', userId)
		.eq('statut', 'analyse')
		.order('cree_le', { ascending: false });
	return (rows ?? []).map((t) => rowToTicket(t, (t.selections as Row[]) ?? []));
}
