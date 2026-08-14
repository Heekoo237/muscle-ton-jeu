import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getTicket, updateTicket } from '$lib/server/fixtures/ticketStore';
import { marketLabelFr } from '$lib/server/domain/market-map';
import { creditCost } from '$lib/server/domain/ticket';
import type { Market, Selection } from '$lib/types';
import { COVERED_MARKETS } from '$lib/types';

function counts(selections: Selection[]) {
	const total = selections.length;
	const analysables = selections.filter((s) => s.etatResolution === 'certain').length;
	return { total, analysables, cout: creditCost(analysables) };
}

/** Découpe « Home – Away » pour reconstruire le libellé après correction. */
function teamsOf(matchLabel: string): [string, string] {
	const [home, away] = matchLabel.split(' – ');
	return [home ?? '', away ?? ''];
}

export interface MarketOption {
	market: Market;
	label: string;
}

export interface ValidationLineVM extends Selection {
	/** Tous les paris possibles du match, pour la feuille de correction. */
	options: MarketOption[];
}

export const load: PageServerLoad = async ({ cookies }) => {
	const id = cookies.get('ticketId');
	const ticket = id ? await getTicket(id) : undefined;
	if (!ticket) redirect(303, '/analyser');
	// Chaque ligne est corrigeable : on précalcule tous les marchés couverts,
	// libellés en français avec les noms d'équipes, pour la feuille de correction.
	const selections: ValidationLineVM[] = ticket.selections.map((s) => {
		const [home, away] = teamsOf(s.matchLabel);
		return {
			...s,
			options: COVERED_MARKETS.map((m) => ({ market: m, label: marketLabelFr(m, home, away) }))
		};
	});
	return { selections, ...counts(ticket.selections) };
};

export const actions: Actions = {
	// Résout une ligne ambiguë avec le marché choisi par l'utilisateur (jamais deviné).
	corriger: async ({ cookies, request }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');

		const form = await request.formData();
		const ordre = Number(form.get('ordre'));
		const marche = String(form.get('marche')) as Market;
		if (!COVERED_MARKETS.includes(marche)) return fail(400, { message: 'Marché inconnu' });

		const selections = ticket.selections.map((s) => {
			if (s.ordre !== ordre) return s;
			const [home, away] = teamsOf(s.matchLabel);
			return {
				...s,
				marche,
				etatResolution: 'certain' as const,
				raison: undefined,
				candidates: undefined,
				libelleFr: marketLabelFr(marche, home, away)
			};
		});
		await updateTicket(ticket.id, { selections });
		// Appelée en arrière-plan (fetch) depuis un affichage déjà à jour : simple
		// succès, aucune redirection (l'écran ne se recharge jamais).
		return { success: true };
	},

	// Retire une ligne non reconnue : elle sort du ticket, jamais facturée.
	retirer: async ({ cookies, request }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');

		const form = await request.formData();
		const ordre = Number(form.get('ordre'));
		const selections = ticket.selections.filter((s) => s.ordre !== ordre);
		await updateTicket(ticket.id, { selections });
		return { success: true };
	},

	// Valide la lecture : le ticket passe en « valide », direction le résultat.
	finaliser: async ({ cookies }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');
		await updateTicket(ticket.id, { statut: 'valide' });
		redirect(303, '/resultat');
	}
};
