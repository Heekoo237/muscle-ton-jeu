import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { getTicket, getAnalysisText } from '$lib/server/fixtures/ticketStore';
import type { LineVM } from '$lib/types';

/**
 * Consultation d'une analyse passée, telle qu'elle a été rendue. Lecture seule,
 * reconstruite depuis les sélections et le résultat déjà stockés : aucun calcul,
 * aucune lecture de predictions, AUCUNE facturation (consultable à vie).
 */
export const load: PageServerLoad = async (event) => {
	const session = (await getAppSession(event))!;
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
		analysable: s.etatResolution === 'certain',
		probabilitePct: typeof s.probabilite === 'number' ? Math.round(s.probabilite * 100 * 10) / 10 : null
	}));

	const texte = await getAnalysisText(ticket.id);

	return {
		dateMs: ticket.creeLeMs,
		nbMatchs: lignes.filter((l) => l.analysable).length,
		lignes,
		probaTotalePct: ticket.result?.probaTotalePct ?? 0,
		probaRenforceePct: ticket.result?.probaRenforceePct ?? 0,
		nbRetirees: ticket.result?.nbRetirees ?? 0,
		texte
	};
};
