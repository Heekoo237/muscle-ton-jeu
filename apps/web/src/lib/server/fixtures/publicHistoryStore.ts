/**
 * publicHistoryStore.ts — Alimente l'historique public depuis ce qui est DÉJÀ persisté
 * (tickets réglés avec LES DEUX verdicts, cotes par ligne, scores). Aucun nouveau
 * stockage. Règlement par ligne déterministe (`settleMarket`), jamais de LLM.
 *
 * ANONYME : on ne lit JAMAIS l'utilisateur — ni user_id, ni rien qui l'identifie. Un
 * ticket = « 21h40 », point. Le pari est une donnée sensible sur ce marché.
 *
 * La cote combinée (produit des cotes gardées) est calculée par le module d'AFFICHAGE
 * `publicHistory.ts`, jamais dans `ticket.ts`/`settle.ts` (garde-fou règle d'or n°1).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { settleMarket } from '$lib/server/domain/settle';
import {
	classer,
	coteCombinee,
	choisirExemples,
	PLANCHER_TICKETS,
	FENETRE_ECHEC_JOURS,
	type LignePublique,
	type TicketPublic
} from '$lib/server/domain/publicHistory';
import type { TicketResult } from '$lib/types';

const UTC_OFFSET_MS = 3_600_000; // Afrique de l'Ouest/Centrale (UTC+1)

export interface PublicHistoryData {
	/** Rien ne s'affiche tant que ce nombre de tickets réglés n'est pas atteint. */
	sousLePlancher: boolean;
	plancher: number;
	/** Total de tickets RÉGLÉS (les deux verdicts) — la mesure du plancher. */
	nbRegles: number;
	/** Tickets qui ont BASCULÉ aujourd'hui (perdus tels quels, gagnants après retrait). */
	nbBascules: number;
	/** Tickets classables du jour (pour « voir les N tickets du jour »). */
	nbDuJour: number;
	/** 3-4 exemples, dont TOUJOURS un échec. */
	exemples: TicketPublic[];
	/** Tous les tickets classables du jour (page « liste complète »). */
	tousDuJour: TicketPublic[];
}

const jourLocal = (ms: number) => {
	const d = new Date(ms + UTC_OFFSET_MS);
	return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
};

type TicketRow = {
	id: number;
	analyse_le: string | null;
	resultat: TicketResult | null;
	resultat_originale: TicketResult | null;
};
type SelRow = {
	ticket_id: number;
	ordre: number;
	match_label: string | null;
	libelle_fr: string | null;
	marche: string | null;
	cote_saisie: number | string | null;
	retiree_du_renforce: boolean | null;
	fixture_id: number | null;
};

export async function computePublicHistory(now: number = Date.now()): Promise<PublicHistoryData> {
	const vide: PublicHistoryData = {
		sousLePlancher: true,
		plancher: PLANCHER_TICKETS,
		nbRegles: 0,
		nbBascules: 0,
		nbDuJour: 0,
		exemples: [],
		tousDuJour: []
	};
	if (!isSupabaseConfigured()) return vide;
	const sb = supabaseAdmin();

	// PLANCHER : nombre TOTAL de tickets réglés (les deux verdicts). Sous le seuil, la
	// page reste vide — un chiffre bruité serait moins honnête qu'une page vide.
	const { count: nbRegles } = await sb
		.from('tickets')
		.select('id', { count: 'exact', head: true })
		.not('resultat', 'is', null)
		.not('resultat_originale', 'is', null);
	const regles = nbRegles ?? 0;
	if (regles < PLANCHER_TICKETS) return { ...vide, nbRegles: regles };

	// Fenêtre d'affichage : les tickets réglés récents (jour + repli échec sur 7 j).
	const depuisIso = new Date(now - FENETRE_ECHEC_JOURS * 86_400_000).toISOString();
	const { data: tk } = await sb
		.from('tickets')
		.select('id, analyse_le, resultat, resultat_originale')
		.not('resultat', 'is', null)
		.not('resultat_originale', 'is', null)
		.not('analyse_le', 'is', null)
		.gte('analyse_le', depuisIso)
		.order('analyse_le', { ascending: false })
		.limit(1000);
	const tickets = (tk ?? []) as TicketRow[];
	if (tickets.length === 0) return { ...vide, sousLePlancher: false, nbRegles: regles };

	// Sélections de ces tickets + scores des matchs, pour régler chaque LIGNE.
	const ids = tickets.map((t) => t.id);
	const { data: sel } = await sb
		.from('selections')
		.select('ticket_id, ordre, match_label, libelle_fr, marche, cote_saisie, retiree_du_renforce, fixture_id')
		.in('ticket_id', ids);
	const selections = (sel ?? []) as SelRow[];
	const fixtureIds = [...new Set(selections.map((s) => s.fixture_id).filter((x): x is number => x != null))];
	const scores = new Map<number, { h: number; a: number }>();
	if (fixtureIds.length > 0) {
		const { data: fx } = await sb
			.from('fixtures')
			.select('id, score_home, score_away')
			.in('id', fixtureIds)
			.not('score_home', 'is', null)
			.not('score_away', 'is', null);
		for (const f of (fx ?? []) as { id: number; score_home: number; score_away: number }[])
			scores.set(Number(f.id), { h: Number(f.score_home), a: Number(f.score_away) });
	}

	const selByTicket = new Map<number, SelRow[]>();
	for (const s of selections) {
		const list = selByTicket.get(s.ticket_id) ?? [];
		list.push(s);
		selByTicket.set(s.ticket_id, list);
	}

	// Construit un TicketPublic classable, ou null (en attente / sans lignes).
	const build = (t: TicketRow): TicketPublic | null => {
		const bascule = classer(t.resultat as TicketResult, t.resultat_originale as TicketResult);
		if (!bascule || !t.analyse_le) return null;
		const rows = (selByTicket.get(t.id) ?? []).slice().sort((a, b) => a.ordre - b.ordre);
		const lignes: LignePublique[] = rows.map((s) => {
			const sc = s.fixture_id != null ? scores.get(s.fixture_id) : undefined;
			const outcome = sc ? settleMarket(s.marche, sc.h, sc.a) : null;
			return {
				matchLabel: s.match_label ?? '',
				libelleFr: s.libelle_fr ?? '',
				cote: s.cote_saisie == null ? null : Number(s.cote_saisie),
				retiree: s.retiree_du_renforce === true,
				tombe: outcome === null ? null : outcome === false
			};
		});
		if (lignes.length === 0) return null;
		return {
			id: t.id,
			analyseLeMs: Date.parse(t.analyse_le),
			bascule,
			lignes,
			coteCombinee: coteCombinee(lignes)
		};
	};

	const classables = tickets.map(build).filter((x): x is TicketPublic => x !== null);
	const jourNow = jourLocal(now);
	const duJour = classables.filter((t) => jourLocal(t.analyseLeMs) === jourNow);
	const poolEchec = classables; // fenêtre 7 j pour le repli d'échec

	return {
		sousLePlancher: false,
		plancher: PLANCHER_TICKETS,
		nbRegles: regles,
		nbBascules: duJour.filter((t) => t.bascule === 'sauve').length,
		nbDuJour: duJour.length,
		exemples: choisirExemples(duJour, poolEchec),
		tousDuJour: duJour.sort((a, b) => b.analyseLeMs - a.analyseLeMs)
	};
}
