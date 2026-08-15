import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { getTicket, getAnalysisText } from '$lib/server/fixtures/ticketStore';
import { parseAnalyse } from '$lib/server/services/writing/serialize';
import { DEMO_MODE, isDemoId, demoTicketDetail } from '$lib/server/demo';
import { isAnalysable } from '$lib/server/domain/ticket';
import type { ExplicationVM, LineVM } from '$lib/types';

/**
 * Consultation d'une analyse passée, telle qu'elle a été rendue. Lecture seule,
 * reconstruite depuis les sélections et le résultat déjà stockés : aucun calcul,
 * aucune lecture de predictions, AUCUNE facturation (consultable à vie).
 */
export const load: PageServerLoad = async (event) => {
	const session = (await getAppSession(event))!;

	// DÉMO (convention) : les coupons fictifs s'ouvrent en lecture seule. Voir demo.ts.
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
				texte: p.texte
			} satisfies ExplicationVM;
		})
		.filter((x): x is ExplicationVM => x !== null)
		.sort((a, b) => a.ordre - b.ordre);

	return {
		dateMs: ticket.creeLeMs,
		nbMatchs: lignes.filter((l) => l.analysable).length,
		lignes,
		probaTotalePct: ticket.result?.probaTotalePct ?? 0,
		probaRenforceePct: ticket.result?.probaRenforceePct ?? 0,
		nbRetirees: ticket.result?.nbRetirees ?? 0,
		synthese: analyse?.synthese ?? null,
		explications
	};
};
