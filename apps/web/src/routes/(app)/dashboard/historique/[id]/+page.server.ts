import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { getTicket, getAnalysisText } from '$lib/server/fixtures/ticketStore';
import { parseAnalyse } from '$lib/server/services/writing/serialize';
import { DEMO_MODE, isDemoId, demoTicketDetail } from '$lib/server/demo';
import { isAnalysable } from '$lib/server/domain/ticket';
import { settleTicket, type FinalScore } from '$lib/server/domain/settle';
import { sports } from '$lib/server/services';
import type { ExplicationVM, LineVM, TicketResult } from '$lib/types';

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
		// Règle unique : analysable = résolu ET pourvu d'une probabilité (figée au moment
		// de l'analyse). Un match résolu sans proba reste « non analysé », jamais compté.
		analysable: isAnalysable(s),
		probabilitePct: typeof s.probabilite === 'number' ? Math.round(s.probabilite * 100 * 10) / 10 : null,
		// Même honnêteté qu'au résultat : la VRAIE raison de non-analyse, pas « non couvert »
		// par défaut. Absente si la ligne est analysée.
		raisonNonAnalyse: isAnalysable(s) ? undefined : (s.raison ?? 'sans_donnee')
	}));

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
				// Pas d'autres issues sur une re-vue figée : cette page ne LIT jamais
				// predictions (lecture seule), et sur un ticket réglé les alternatives sont
				// jouées — l'affordance « si tu veux garder ce match » n'a de sens qu'au résultat.
				autresIssues: [] as ExplicationVM['autresIssues']
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
	const verdict: 'attente' | TicketResult = v.originale;
	const tombeSur =
		v.originale === 'tombe' && v.premierPerduOrdre != null
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
		// L'original tombe mais le renforcé aurait tenu : l'argument du produit.
		verdictRenforce: v.originale === 'tombe' && v.renforce === 'passe',
		issues
	};
};
