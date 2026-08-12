import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTicket, updateTicket } from '$lib/server/fixtures/ticketStore';
import { predictions, writing } from '$lib/server/services';
import { buildReinforced, DEFAULT_FRAGILE_THRESHOLD } from '$lib/server/domain/ticket';
import { checkGeneratedText } from '$lib/server/domain/guards';
import type { WritingInput } from '$lib/server/services/writing';
import type { LineVM, ResultVM, Selection } from '$lib/types';

/** Arrondi au dixième de pour-cent, cohérent avec l'affichage et les garde-fous. */
function pct1(prob: number): number {
	return Math.round(prob * 100 * 10) / 10;
}

/**
 * Rédaction sous garde-fous (brief §4.3/4.4) : on régénère si un nombre est
 * fabriqué ou un terme interdit apparaît ; après 2 échecs, template sans chiffres.
 */
async function writeSafely(input: WritingInput): Promise<string> {
	for (let i = 0; i < 2; i++) {
		const texte = await writing.writeAnalysis(input);
		if (checkGeneratedText(texte, writing.allowedNumbers(input)).ok) return texte;
	}
	return input.rienARetirer
		? 'Rien à retirer. Ton ticket tient debout.'
		: 'On a repéré les sélections fragiles de ton ticket. Regarde la version renforcée.';
}

export const load: PageServerLoad = async ({ cookies }) => {
	const id = cookies.get('ticketId');
	const ticket = id ? getTicket(id) : undefined;
	if (!ticket) redirect(303, '/analyser');

	// 1. Lire les probabilités en table (jamais de calcul ici — règle d'archi n°2).
	const withProbs: Selection[] = await Promise.all(
		ticket.selections.map(async (s) => {
			if (s.etatResolution !== 'certain' || s.fixtureId === null || s.marche === null) return s;
			const p = await predictions.get(s.fixtureId, s.marche);
			return { ...s, probabilite: p?.probabilite ?? null };
		})
	);

	// 2. Produit, marquage fragile, renforcé par retrait (plancher 4).
	const r = buildReinforced(withProbs, DEFAULT_FRAGILE_THRESHOLD);

	// 3. Rédaction sous garde-fous.
	const fragiles = r.selections
		.filter((s) => s.fragile && s.retireeDuRenforce)
		.map((s) => ({ libelleFr: `${s.matchLabel} — ${s.libelleFr}` }));
	const writingInput: WritingInput = {
		probaTotalePct: pct1(r.probaTotale),
		probaRenforceePct: pct1(r.probaRenforcee),
		nbRetirees: r.retirees.length,
		fragiles,
		confiance: 'correcte',
		rienARetirer: r.rienARetirer
	};
	const texte = await writeSafely(writingInput);

	// 4. Débit à l'affichage réussi : la persistance du crédit arrive en Session 5.
	//    On fige les chiffres du résultat (source de l'image de partage).
	updateTicket(ticket.id, {
		statut: 'analyse',
		result: {
			probaTotalePct: writingInput.probaTotalePct,
			probaRenforceePct: writingInput.probaRenforceePct,
			nbRetirees: writingInput.nbRetirees
		}
	});

	const lignes: LineVM[] = r.selections.map((s) => ({
		ordre: s.ordre,
		index: String(s.ordre).padStart(2, '0'),
		matchLabel: s.matchLabel || s.texteBrut,
		libelleFr: s.libelleFr,
		cote: s.coteSaisie,
		fragile: s.fragile,
		retiree: s.retireeDuRenforce,
		analysable: s.etatResolution === 'certain'
	}));

	const vm: ResultVM = {
		lignes,
		probaTotalePct: writingInput.probaTotalePct,
		probaRenforceePct: writingInput.probaRenforceePct,
		nbRetirees: writingInput.nbRetirees,
		texte,
		rienARetirer: r.rienARetirer,
		conflitMemeMatch: r.conflitMemeMatch
	};
	return { ticketId: ticket.id, vm };
};
