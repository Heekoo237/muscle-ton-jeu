import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getTicket, updateTicket, saveAnalysisText } from '$lib/server/fixtures/ticketStore';
import { listHistoryMarquee } from '$lib/server/fixtures/historyStore';
import { hasRecharged, markPremierTicketUtilise, record } from '$lib/server/fixtures/userStore';
import { getAppSession } from '$lib/server/session';
import { predictions, writing, notifications } from '$lib/server/services';
import { buildReinforced, DEFAULT_FRAGILE_THRESHOLD } from '$lib/server/domain/ticket';
import { computeCharge } from '$lib/server/domain/billing';
import { hasConsumedOffer, recordOfferConsumed } from '$lib/server/fixtures/offeredDeviceStore';
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

export const load: PageServerLoad = async (event) => {
	const { cookies } = event;
	const id = cookies.get('ticketId');
	const ticket = id ? await getTicket(id) : undefined;
	if (!ticket) redirect(303, '/analyser');

	// 0. Mur de connexion : après l'analyse, juste avant le résultat (PRD §7).
	const session = await getAppSession(event);
	if (!session) redirect(303, '/connexion?retour=/resultat');

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

	// 4. Facturation (règle : débit à l'affichage réussi, jamais avant, une fois).
	//    Idempotent : une fois `billing` posé, on ne recalcule ni ne redébite.
	const nbAnalysables = withProbs.filter((s) => s.etatResolution === 'certain').length;
	let billing = ticket.billing;
	if (!billing) {
		// Trois vérifications pour le ticket offert :
		//  1) le compte n'a jamais consommé son offre (premier_ticket_utilise faux),
		//  2) l'empreinte d'appareil n'a pas déjà consommé une offre,
		//  3) le ticket est substantiel : ≥ 3 sélections analysables, non « tout solide ».
		const fp = cookies.get('mtj_fp') ?? '';
		const offreDejaSurAppareil = fp !== '' && (await hasConsumedOffer(fp));
		const compteEligible = !session.premierTicketUtilise && nbAnalysables >= 3 && !r.rienARetirer;
		const promoEligible = compteEligible && !offreDejaSurAppareil;

		const charge = computeCharge({
			nbAnalysables,
			premierTicket: promoEligible,
			rienARetirer: r.rienARetirer
		});

		if (charge.raison === 'premier_ticket') {
			// Offre accordée : on la consomme à l'affichage réussi (compte + appareil).
			await recordOfferConsumed(fp);
			await markPremierTicketUtilise(session.userId);
		} else if (!charge.gratuit && !charge.bloque) {
			const cost = charge.credits ?? 0;
			// Blocage de l'affichage si le solde est insuffisant (jamais l'entrée).
			if (session.credits < cost) {
				// Empreinte déjà servie sur un compte neuf : message honnête, sans reproche.
				const motif = compteEligible && offreDejaSurAppareil ? '&motif=empreinte' : '';
				redirect(303, `/recharge?besoin=${cost}&retour=/resultat${motif}`);
			}
			await record(session.userId, -cost, 'debit_analyse', ticket.id); // débit à l'affichage
		}

		billing = { gratuit: charge.gratuit, credits: charge.credits ?? 0 };
		// Fige le texte rendu : l'historique le relira à vie, sans jamais refacturer.
		await saveAnalysisText(ticket.id, texte);
		await updateTicket(ticket.id, {
			statut: 'analyse',
			billing,
			userId: session.userId,
			result: {
				probaTotalePct: writingInput.probaTotalePct,
				probaRenforceePct: writingInput.probaRenforceePct,
				nbRetirees: writingInput.nbRetirees,
				nbFragiles: r.selections.filter((s) => s.fragile).length
			}
		});
	}

	const lignes: LineVM[] = r.selections.map((s) => ({
		ordre: s.ordre,
		index: String(s.ordre).padStart(2, '0'),
		matchLabel: s.matchLabel || s.texteBrut,
		libelleFr: s.libelleFr,
		cote: s.coteSaisie,
		fragile: s.fragile,
		retiree: s.retireeDuRenforce,
		analysable: s.etatResolution === 'certain',
		// Probabilité par ligne : lue en table (jamais calculée ici), affichée dans
		// la lecture détaillée. null quand la sélection n'est pas analysable.
		probabilitePct: typeof s.probabilite === 'number' ? pct1(s.probabilite) : null
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
	// Bandeau d'historique : sélections déjà marquées, matchs terminés, issue
	// réelle. On ne l'affiche QUE s'il y a au moins 20 résultats en base — sinon,
	// aucun remplissage de démonstration (le bandeau reste absent).
	const histo = await listHistoryMarquee(40);
	const historique = histo.length >= 20 ? histo : [];

	// Invitation à recharger : seulement une fois l'analyse offerte terminée et
	// tant que l'utilisateur n'a pas encore rechargé — jamais avant le résultat.
	return {
		ticketId: ticket.id,
		vm,
		gratuit: billing.gratuit,
		montreRecharge: !(await hasRecharged(session.userId)),
		historique
	};
};

export const actions: Actions = {
	// Autorisation de notification demandée sur l'écran de résultat (PRD §10).
	// En factice : on enregistre un abonnement fictif. Le vrai Web Push (VAPID,
	// permission navigateur) est branché en Session 8.
	notifier: async (event) => {
		const session = await getAppSession(event);
		if (session) {
			await notifications.saveSubscription(session.userId, {
				endpoint: 'fake-endpoint',
				p256dh: 'fake',
				auth: 'fake'
			});
		}
		return { notifie: true };
	}
};

