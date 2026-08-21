/**
 * reglementDiag.ts — DIAGNOSTIC du règlement (lecture seule, zéro crédit). Répond à
 * une seule question, par la donnée et non par la supposition : « pourquoi les tickets
 * restent-ils en attente ? ». Il ne CORRIGE rien — il expose l'état réel pour trancher
 * entre les causes possibles :
 *
 *  - `tousTerminesNonRegles` > 0  → les scores SONT en base mais le règlement ne pose
 *      pas le verdict : bug côté app (chemin `/api/cron/settle`), PAS les scores.
 *  - `matchNonTermine` > 0        → au moins un match dont le coup d'envoi est passé
 *      n'a pas de score `finished` : les scores n'atterrissent pas (fenêtre `/scores`,
 *      ou match non renvoyé par le fournisseur).
 *  - `matchAVenir` > 0            → légitimement en attente (un match pas encore joué).
 *  - `horsFenetre7j` > 0          → tickets trop vieux pour la fenêtre de règlement :
 *      même une fois les scores écrits, le job ne les reprend pas (dette à rattraper).
 *
 * Miroir EXACT de la logique du job (domain/settle : `isSettleable`), mais en lecture.
 */
import { supabaseAdmin } from '$lib/server/supabase';
import { isSettleable, type FinalScore } from '$lib/server/domain/settle';
import type { Selection } from '$lib/types';

const FENETRE_JOURS = 7; // même borne que pendingSettleTickets / LEAGUES_SQL

export interface ReglementDiag {
	now: string;
	tickets: { total: number; regles: number; enAttente: number };
	enAttenteDetail: {
		tousTerminesNonRegles: number;
		matchNonTermine: number;
		matchAVenir: number;
		sansSelectionReglable: number;
		horsFenetre7j: number;
	};
	fixturesReglables: {
		total: number;
		finished: number;
		scheduled: number;
		autre: number;
		avecScore: number;
		sansProviderRef: number;
	};
	ageJoursEnAttente: { plusVieux: number | null; plusRecent: number | null };
	/** Les matchs « coup d'envoi passé, sans score » — pour dire LESQUELS et depuis quand. */
	matchNonTermineDetail: {
		fixtureId: number;
		ligue: string | null;
		match: string;
		dateUtc: string | null;
		statut: string;
		joursDepuisCoupEnvoi: number | null;
	}[];
	/**
	 * AMPLEUR système (indépendant des tickets) : matchs `scheduled` dont le coup
	 * d'envoi est passé depuis > 3 h → presque sûrement terminés mais jamais scorés.
	 * `horsFenetre3j` : au-delà de la fenêtre `/scores` du fournisseur → irrécupérables.
	 */
	matchsBloquesGlobal: {
		total: number;
		parRegime: { modele: number; cote_seule: number; inconnu: number };
		horsFenetre3j: number;
		dansFenetre3j: number;
	};
}

function selFrom(r: Record<string, unknown>): Selection {
	return {
		ordre: Number(r.ordre ?? 0),
		texteBrut: '',
		fixtureId: r.fixture_id == null ? null : Number(r.fixture_id),
		matchLabel: '',
		marche: (r.marche as Selection['marche']) ?? null,
		etatResolution: r.etat_resolution as Selection['etatResolution'],
		coteSaisie: null,
		probabilite: null,
		seuilFragile: null,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: ''
	};
}

export async function diagnostiquerReglement(nowMs: number): Promise<ReglementDiag> {
	const db = supabaseAdmin();
	const now = new Date(nowMs);
	const cutoff = new Date(nowMs - FENETRE_JOURS * 86_400_000);

	const { data: tks } = await db
		.from('tickets')
		.select('id, cree_le, resultat')
		.eq('statut', 'analyse')
		.not('user_id', 'is', null)
		.limit(5000);
	const tickets = (tks ?? []) as { id: number; cree_le: string | null; resultat: string | null }[];

	const regles = tickets.filter((t) => t.resultat != null).length;
	const enAttenteTickets = tickets.filter((t) => t.resultat == null);

	// Sélections de tous les tickets en attente.
	const ids = enAttenteTickets.map((t) => t.id);
	const selByTicket = new Map<number, Selection[]>();
	const fixtureIds = new Set<number>();
	if (ids.length > 0) {
		const { data: sels } = await db
			.from('selections')
			.select('ticket_id, ordre, fixture_id, marche, etat_resolution')
			.in('ticket_id', ids)
			.limit(20000);
		for (const r of (sels ?? []) as Record<string, unknown>[]) {
			const tid = Number(r.ticket_id);
			if (!selByTicket.has(tid)) selByTicket.set(tid, []);
			const s = selFrom(r);
			selByTicket.get(tid)!.push(s);
			if (s.fixtureId != null) fixtureIds.add(s.fixtureId);
		}
	}

	// État des fixtures référencées.
	const fxStatut = new Map<number, string>();
	const fxScore = new Map<number, FinalScore>();
	const fxDate = new Map<number, number>();
	const fxSansRef = new Set<number>();
	const fixturesReglables = { total: 0, finished: 0, scheduled: 0, autre: 0, avecScore: 0, sansProviderRef: 0 };
	if (fixtureIds.size > 0) {
		const { data: fx } = await db
			.from('fixtures')
			.select('id, statut, score_home, score_away, date_utc, provider_ref')
			.in('id', [...fixtureIds])
			.limit(20000);
		for (const f of (fx ?? []) as Record<string, unknown>[]) {
			const id = Number(f.id);
			const statut = String(f.statut);
			fxStatut.set(id, statut);
			if (f.date_utc) fxDate.set(id, Date.parse(f.date_utc as string));
			if (f.provider_ref == null) fxSansRef.add(id);
			if (f.score_home != null && f.score_away != null)
				fxScore.set(id, { home: Number(f.score_home), away: Number(f.score_away) });
		}
	}

	// Détail par ticket en attente : ne regarde QUE les sélections réglables (comme le job).
	const detail = { tousTerminesNonRegles: 0, matchNonTermine: 0, matchAVenir: 0, sansSelectionReglable: 0, horsFenetre7j: 0 };
	const stuckIds = new Set<number>(); // coup d'envoi passé, sans score
	let plusVieux: number | null = null;
	let plusRecent: number | null = null;
	for (const t of enAttenteTickets) {
		const creeMs = t.cree_le ? Date.parse(t.cree_le) : nowMs;
		plusVieux = plusVieux == null ? creeMs : Math.min(plusVieux, creeMs);
		plusRecent = plusRecent == null ? creeMs : Math.max(plusRecent, creeMs);
		if (creeMs < cutoff.getTime()) detail.horsFenetre7j += 1;

		const reglables = (selByTicket.get(t.id) ?? []).filter(isSettleable);
		if (reglables.length === 0) {
			detail.sansSelectionReglable += 1;
			continue;
		}
		let tousFinished = true;
		let unPasseNonTermine = false;
		let unAVenir = false;
		for (const s of reglables) {
			const id = s.fixtureId as number;
			fixturesReglables.total += 1;
			const st = fxStatut.get(id) ?? 'inconnu';
			if (st === 'finished') fixturesReglables.finished += 1;
			else if (st === 'scheduled') fixturesReglables.scheduled += 1;
			else fixturesReglables.autre += 1;
			if (fxScore.has(id)) fixturesReglables.avecScore += 1;
			if (fxSansRef.has(id)) fixturesReglables.sansProviderRef += 1;

			const termine = st === 'finished' && fxScore.has(id);
			if (!termine) {
				tousFinished = false;
				const d = fxDate.get(id);
				if (d != null && d <= now.getTime()) {
					unPasseNonTermine = true;
					stuckIds.add(id);
				} else unAVenir = true;
			}
		}
		if (tousFinished) detail.tousTerminesNonRegles += 1;
		else if (unPasseNonTermine) detail.matchNonTermine += 1;
		else if (unAVenir) detail.matchAVenir += 1;
	}

	// Nomme les matchs bloqués (coup d'envoi passé, sans score) : équipes + ligue.
	const matchNonTermineDetail: ReglementDiag['matchNonTermineDetail'] = [];
	if (stuckIds.size > 0) {
		const echantillon = [...stuckIds].slice(0, 25);
		const { data: fx } = await db
			.from('fixtures')
			.select('id, team_home_id, team_away_id, league_id, date_utc, statut')
			.in('id', echantillon);
		const rows = (fx ?? []) as Record<string, unknown>[];
		const teamIds = new Set<number>();
		const leagueIds = new Set<number>();
		for (const r of rows) {
			if (r.team_home_id != null) teamIds.add(Number(r.team_home_id));
			if (r.team_away_id != null) teamIds.add(Number(r.team_away_id));
			if (r.league_id != null) leagueIds.add(Number(r.league_id));
		}
		const teamNom = new Map<number, string>();
		const ligueNom = new Map<number, string | null>();
		if (teamIds.size > 0) {
			const { data: tm } = await db.from('teams').select('id, nom').in('id', [...teamIds]);
			for (const t of (tm ?? []) as { id: number; nom: string }[]) teamNom.set(Number(t.id), t.nom);
		}
		if (leagueIds.size > 0) {
			const { data: lg } = await db.from('leagues').select('id, provider_ref').in('id', [...leagueIds]);
			for (const l of (lg ?? []) as { id: number; provider_ref: string | null }[])
				ligueNom.set(Number(l.id), l.provider_ref ?? null);
		}
		for (const r of rows) {
			const id = Number(r.id);
			const d = r.date_utc ? Date.parse(r.date_utc as string) : null;
			matchNonTermineDetail.push({
				fixtureId: id,
				ligue: r.league_id != null ? (ligueNom.get(Number(r.league_id)) ?? null) : null,
				match: `${teamNom.get(Number(r.team_home_id)) ?? '?'} – ${teamNom.get(Number(r.team_away_id)) ?? '?'}`,
				dateUtc: (r.date_utc as string) ?? null,
				statut: String(r.statut),
				joursDepuisCoupEnvoi: d == null ? null : Math.round((nowMs - d) / 86_400_000)
			});
		}
		matchNonTermineDetail.sort((a, b) => (b.joursDepuisCoupEnvoi ?? 0) - (a.joursDepuisCoupEnvoi ?? 0));
	}

	// AMPLEUR système : tous les matchs `scheduled` dont le coup d'envoi est passé
	// depuis > 3 h — un score qui n'est jamais arrivé. Indépendant des tickets.
	const matchsBloquesGlobal = { total: 0, parRegime: { modele: 0, cote_seule: 0, inconnu: 0 }, horsFenetre3j: 0, dansFenetre3j: 0 };
	const seuil3h = nowMs - 3 * 3_600_000;
	const seuil3j = nowMs - 3 * 86_400_000;
	const { data: bloq } = await db
		.from('fixtures')
		.select('id, league_id, date_utc')
		.eq('statut', 'scheduled')
		.lt('date_utc', new Date(seuil3h).toISOString())
		.limit(10000);
	const bloqRows = (bloq ?? []) as { id: number; league_id: number | null; date_utc: string | null }[];
	if (bloqRows.length > 0) {
		// Régime par ligue : fixtures.league_id → leagues.provider_ref → league_catalog.regime.
		const lIds = [...new Set(bloqRows.map((r) => r.league_id).filter((x): x is number => x != null))];
		const refByLeague = new Map<number, string>();
		if (lIds.length > 0) {
			const { data: lg } = await db.from('leagues').select('id, provider_ref').in('id', lIds);
			for (const l of (lg ?? []) as { id: number; provider_ref: string | null }[])
				if (l.provider_ref) refByLeague.set(Number(l.id), l.provider_ref);
		}
		const regimeByRef = new Map<string, string>();
		const refs = [...new Set([...refByLeague.values()])];
		if (refs.length > 0) {
			const { data: cat } = await db.from('league_catalog').select('fd_code, regime').in('fd_code', refs);
			for (const c of (cat ?? []) as { fd_code: string; regime: string }[]) regimeByRef.set(c.fd_code, c.regime);
		}
		for (const r of bloqRows) {
			matchsBloquesGlobal.total += 1;
			const ref = r.league_id != null ? refByLeague.get(Number(r.league_id)) : undefined;
			const regime = ref ? regimeByRef.get(ref) : undefined;
			if (regime === 'modele') matchsBloquesGlobal.parRegime.modele += 1;
			else if (regime === 'cote_seule') matchsBloquesGlobal.parRegime.cote_seule += 1;
			else matchsBloquesGlobal.parRegime.inconnu += 1;
			const d = r.date_utc ? Date.parse(r.date_utc) : null;
			if (d != null && d < seuil3j) matchsBloquesGlobal.horsFenetre3j += 1;
			else matchsBloquesGlobal.dansFenetre3j += 1;
		}
	}

	return {
		now: now.toISOString(),
		tickets: { total: tickets.length, regles, enAttente: enAttenteTickets.length },
		enAttenteDetail: detail,
		fixturesReglables,
		ageJoursEnAttente: {
			plusVieux: plusVieux == null ? null : Math.round((nowMs - plusVieux) / 86_400_000),
			plusRecent: plusRecent == null ? null : Math.round((nowMs - plusRecent) / 86_400_000)
		},
		matchNonTermineDetail,
		matchsBloquesGlobal
	};
}
