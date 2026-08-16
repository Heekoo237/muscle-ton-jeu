import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { listerTransactions, type TxStatut } from '$lib/server/fixtures/rechargeStore';
import { paysDe, operateurDe } from '$lib/payments/operators';

const LIBELLE: Record<TxStatut, string> = {
	initiated: 'Initiée',
	pending: 'En attente',
	success: 'Réussie',
	failed: 'Échouée',
	expired: 'Expirée'
};

export const load: PageServerLoad = async (event) => {
	const session = await getAppSession(event);
	if (!session) redirect(303, '/connexion?retour=/dashboard/recharges');
	const txns = await listerTransactions(session.userId);
	return {
		recharges: txns.map((t) => {
			const pays = paysDe(t.pays);
			return {
				reference: t.reference,
				montant: t.montant,
				credits: t.credits,
				statut: t.statut,
				libelle: LIBELLE[t.statut],
				operateur: pays ? (operateurDe(pays, t.operateur)?.nom ?? t.operateur) : t.operateur,
				msisdn: t.msisdn,
				dateMs: t.creeLeMs,
				enCours: t.statut === 'initiated' || t.statut === 'pending'
			};
		})
	};
};
