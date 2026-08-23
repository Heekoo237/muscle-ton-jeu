import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAppSession } from '$lib/server/session';
import { getTicket, getAnalysisText } from '$lib/server/fixtures/ticketStore';
import { supprimerTicket } from '$lib/server/fixtures/ticketDeletion';
import { parseAnalyse } from '$lib/server/services/writing/serialize';
import { DEMO_MODE, isDemoId, demoTicketDetail } from '$lib/server/demo';
import { isAnalysable, estSerree } from '$lib/server/domain/ticket';
import {
	settleTicket,
	verdictAffiche,
	isSettleable,
	resultatIntrouvable,
	type FinalScore
} from '$lib/server/domain/settle';
import { sports, predictions } from '$lib/server/services';
import { autresIssuesParRetrait } from '$lib/server/domain/resultDisplay';
import { marketLabelFr } from '$lib/server/domain/market-map';
import type { ExplicationVM, LineVM, Market, TicketResult } from '$lib/types';

/**
 * Consultation d'une analyse passée, telle qu'elle a été rendue. Lecture seule,
 * reconstruite depuis les sélections et le résultat déjà stockés : aucun calcul,
 * aucune lecture de predictions, AUCUNE facturation (consultable à vie).
 */
export const load: PageServerLoad = async (event) => {
	const session = (await getAppSession(event))!;

	// DÉMO (convention) : les tickets fictifs s'ouvrent en lecture seule. Voir demo.ts.
	if (DEMO_MODE && isDemoId(event.params.id)) {
		return demoTicketDetail(event.params.id, Date.now());
	}

	const ticket = await getTicket(event.params.id);

	if (!ticket || ticket.statut !== 'analyse') redirect(303, '/dashboard/historique');
	if (ticket.userId == null || ticket.userId !== session.userId) error(403, 'Ce ticket ne t’appartient pas.');

	const lignes: LineVM[] = ticket.selections.map((s) => ({
		ordre: s.ordre,
		index: String(s.ordre).padStart(2, '0'),
		matchLabel: s.matchLabel || s.texteBrut,
		libelleFr: s.libelleFr,
		cote: s.coteSaisie,
		fragile: s.fragile,
		retiree: s.retireeDuRenforce,
		mentionNeutre: s.retireeDuRenforce && !s.fragile,
		// GARDÉE mais serrée (« pas retiré » ≠ « solide »). Le seuil cote seule par ligne
		// n'est pas persisté (seuilFragile null) → estSerree retombe sur le seuil MODÈLE :
		// exact sur les 1X2 (mêmes seuils modèle/cote seule) et à ±0,02 près sur la double
		// chance. L'écart penche vers « serré », le côté prudent — on ne dit jamais « solide » à tort.
		serree: !s.retireeDuRenforce && estSerree(s),
		// Règle unique : analysable = résolu ET pourvu d'une probabilité (figée au moment
		// de l'analyse). Un match résolu sans proba reste « non analysé », jamais compté.
		analysable: isAnalysable(s),
		probabilitePct: typeof s.probabilite === 'number' ? Math.round(s.probabilite * 100 * 10) / 10 : null,
		// Même honnêteté qu'au résultat : la VRAIE raison de non-analyse, pas « non couvert »
		// par défaut. Absente si la ligne est analysée.
		raisonNonAnalyse: isAnalysable(s) ? undefined : (s.raison ?? 'sans_donnee')
	}));

	// Autres issues du même match d'une ligne retirée — PARITÉ avec l'écran de résultat.
	// UNIQUEMENT tant que le ticket n'est pas réglé (matchs à venir) : sur un ticket réglé,
	// les matchs sont joués et « si tu veux garder ce match » n'a plus de sens. Lecture
	// SEULE de predictions (aucun calcul, aucune proba dérivée — règles d'or n°1/n°3) ;
	// contenu produit par la fonction PURE verrouillée par test (autresIssuesParRetrait).
	const dejaRegle = ticket.resultatOriginale === 'passe' || ticket.resultatOriginale === 'tombe';
	const retireesVoisins = ticket.selections.filter(
		(s) => s.retireeDuRenforce && isAnalysable(s) && s.fixtureId !== null && s.marche !== null
	);
	const autresParOrdre = new Map<number, { libelleFr: string; probabilitePct: number }[]>();
	if (!dejaRegle && retireesVoisins.length > 0) {
		const preds = await predictions.forFixtures([
			...new Set(retireesVoisins.map((s) => s.fixtureId as number))
		]);
		const contenu = autresIssuesParRetrait(
			retireesVoisins.map((s) => ({ ordre: s.ordre, marche: s.marche as Market, fixtureId: s.fixtureId as number })),
			preds
		);
		for (const s of retireesVoisins) {
			const issues = contenu.get(s.ordre);
			if (!issues) continue;
			const parts = s.matchLabel.split(' – ');
			const [home, away] = parts.length === 2 ? parts : ['', ''];
			autresParOrdre.set(
				s.ordre,
				issues.map((iss) => ({
					libelleFr: marketLabelFr(iss.marche, home, away),
					probabilitePct: Math.round(iss.probabilite * 100 * 10) / 10
				}))
			);
		}
	}

	// Texte figé, relu tel quel (deux niveaux ; ancien texte plat toléré).
	const analyse = parseAnalyse(await getAnalysisText(ticket.id));
	const parLigne = new Map(lignes.map((l) => [l.ordre, l]));
	const explications: ExplicationVM[] = (analyse?.parSelection ?? [])
		.map((p) => {
			const l = parLigne.get(p.ordre);
			if (!l) return null;
			return {
				ordre: p.ordre,
				matchLabel: l.matchLabel,
				libelleFr: l.libelleFr,
				avecBadge: l.fragile,
				texte: p.texte,
				// Alternatives du match retiré, tant que le ticket n'est pas réglé (sinon vide).
				autresIssues: autresParOrdre.get(p.ordre) ?? ([] as ExplicationVM['autresIssues'])
			} satisfies ExplicationVM;
		})
		.filter((x): x is ExplicationVM => x !== null)
		.sort((a, b) => a.ordre - b.ordre);

	// RÈGLEMENT pour l'affichage : c'est ici qu'atterrit le clic sur la notification
	// « ton ticket est tombé ». On montre le VERDICT et, si c'est le cas, que le
	// renforcé serait passé — notre meilleur argument. Déterministe (settle.ts),
	// jamais un LLM. Scores bornés à la période du ticket (fetch léger).
	const depuis = new Date(ticket.creeLeMs - 2 * 86_400_000).toISOString();
	const finished = await sports.resultsSince(depuis);
	const scores = new Map<number, FinalScore>();
	for (const f of finished) {
		if (f.scoreHome != null && f.scoreAway != null) scores.set(f.id, { home: f.scoreHome, away: f.scoreAway });
	}
	const v = settleTicket(ticket.selections, scores);
	// SOURCE DE VÉRITÉ : le verdict persisté par le règlement prime ; le recalcul ne
	// sert qu'à la fenêtre ≤ 6 h avant le cron, et à situer « tombé sur ce match ».
	const verdictOriginale = verdictAffiche(ticket.resultatOriginale, v.originale);

	// Statut honnête quand le ticket ne se réglera jamais : soit rien de réglable, soit
	// un score qui n'arrivera plus (dernier match réglable passé depuis > 5 j, sans score).
	const reglables = ticket.selections.filter(isSettleable);
	let statutTerminal: 'sans_reglement' | 'indisponible' | null = null;
	if (verdictOriginale === 'en_attente') {
		if (reglables.length === 0) statutTerminal = 'sans_reglement';
		else {
			const dates = await sports.fixtureDates(reglables.map((s) => s.fixtureId as number));
			const dernier = [...dates.values()];
			const dernierKickoff = dernier.length ? Math.max(...dernier) : null;
			if (resultatIntrouvable(dernierKickoff, Date.now())) statutTerminal = 'indisponible';
		}
	}
	const verdict: 'attente' | 'sans_reglement' | 'indisponible' | TicketResult =
		statutTerminal ?? verdictOriginale;
	const tombeSur =
		verdictOriginale === 'tombe' && v.premierPerduOrdre != null
			? (ticket.selections.find((s) => s.ordre === v.premierPerduOrdre)?.matchLabel ?? null)
			: null;
	// Issue par ligne (ordre → passé / tombé / en attente), pour marquer le détail.
	const issues: Record<number, 'passe' | 'tombe' | 'attente'> = {};
	for (const [ordre, o] of v.parSelection) issues[ordre] = o === null ? 'attente' : o ? 'passe' : 'tombe';

	return {
		dateMs: ticket.creeLeMs,
		nbMatchs: lignes.filter((l) => l.analysable).length,
		lignes,
		probaTotalePct: ticket.result?.probaTotalePct ?? 0,
		probaRenforceePct: ticket.result?.probaRenforceePct ?? 0,
		nbRetirees: ticket.result?.nbRetirees ?? 0,
		synthese: analyse?.synthese ?? null,
		explications,
		// Verdict du règlement (null d'affichage = « en attente »).
		verdict,
		tombeSur,
		// L'original tombe mais le renforcé aurait tenu : l'argument du produit. Verdict
		// persisté prioritaire ; repli sur le recalcul tant que le cron n'a rien posé.
		verdictRenforce:
			ticket.resultatOriginale === 'tombe' && ticket.resultat === 'passe'
				? true
				: ticket.resultatOriginale == null && v.originale === 'tombe' && v.renforce === 'passe',
		issues
	};
};

export const actions: Actions = {
	/**
	 * Suppression de CETTE analyse par son propriétaire. Anonymisation sur place (le
	 * ticket quitte l'historique privé, reste anonyme dans l'historique public). La
	 * confirmation à deux temps est portée par l'UI ; ici on refait la vérif de propriété
	 * côté serveur (jamais confiance au client) avant d'agir.
	 */
	supprimer: async (event) => {
		const session = await getAppSession(event);
		if (!session) return fail(401, { erreur: 'non_connecte' });
		const res = await supprimerTicket(event.params.id, session.userId);
		if (!res.ok) return fail(res.raison === 'introuvable' ? 404 : 403, { erreur: res.raison });
		redirect(303, '/dashboard/historique?supprime=1');
	}
};
