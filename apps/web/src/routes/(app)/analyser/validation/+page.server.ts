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

export const load: PageServerLoad = async ({ cookies }) => {
	const id = cookies.get('ticketId');
	const ticket = id ? getTicket(id) : undefined;
	if (!ticket) redirect(303, '/analyser');
	return { selections: ticket.selections, ...counts(ticket.selections) };
};

/** Découpe « Home – Away » pour reconstruire le libellé après correction. */
function teamsOf(matchLabel: string): [string, string] {
	const [home, away] = matchLabel.split(' – ');
	return [home ?? '', away ?? ''];
}

export const actions: Actions = {
	// Résout une ligne ambiguë avec le marché choisi par l'utilisateur (jamais deviné).
	corriger: async ({ cookies, request }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? getTicket(id) : undefined;
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
		updateTicket(ticket.id, { selections });
		redirect(303, '/analyser/validation');
	},

	// Retire une ligne non reconnue : elle sort du ticket, jamais facturée.
	retirer: async ({ cookies, request }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');

		const form = await request.formData();
		const ordre = Number(form.get('ordre'));
		const selections = ticket.selections.filter((s) => s.ordre !== ordre);
		updateTicket(ticket.id, { selections });
		redirect(303, '/analyser/validation');
	},

	// Valide la lecture : le ticket passe en « valide », direction le résultat.
	finaliser: async ({ cookies }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');
		updateTicket(ticket.id, { statut: 'valide' });
		redirect(303, '/resultat');
	}
};
