import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAppSession } from '$lib/server/session';
import { getUserById } from '$lib/server/fixtures/userStore';
import { paiementModeTest } from '$lib/server/paymentMode';
import {
	getTransaction,
	confirmerRecharge,
	echouerRecharge,
	EXPIRATION_MINUTES
} from '$lib/server/fixtures/rechargeStore';

function safeRetour(url: URL): string {
	const r = url.searchParams.get('retour');
	return r && r.startsWith('/') ? r : '/dashboard';
}

export const load: PageServerLoad = async (event) => {
	const session = await getAppSession(event);
	if (!session) redirect(303, '/connexion?retour=/recharge');
	const ref = event.url.searchParams.get('ref') ?? '';
	const tx = ref ? await getTransaction(ref) : null;
	// Transaction inconnue ou d'un autre compte → retour à la recharge (jamais fuiter).
	if (!tx || tx.userId !== session.userId) redirect(303, '/recharge');

	return {
		reference: tx.reference,
		montant: tx.montant,
		credits: tx.credits,
		operateur: tx.operateur,
		msisdn: tx.msisdn,
		statut: tx.statut,
		expireLeMs: tx.expireLeMs,
		expirationMinutes: EXPIRATION_MINUTES,
		modeTest: paiementModeTest(),
		retour: safeRetour(event.url)
	};
};

export const actions: Actions = {
	// Saisie du code opérateur (factice). En mode réel, le code partira à l'agrégateur.
	confirmer: async (event) => {
		const session = await getAppSession(event);
		if (!session) redirect(303, '/connexion?retour=/recharge');
		const form = await event.request.formData();
		const ref = String(form.get('ref') ?? '');
		const code = String(form.get('code') ?? '').trim();

		const tx = await getTransaction(ref);
		if (!tx || tx.userId !== session.userId) return fail(404, { resultat: 'introuvable' });

		// Délai dépassé (expiration paresseuse déjà appliquée à la lecture).
		if (tx.statut === 'expired') return { resultat: 'expire' };
		if (tx.statut === 'failed') return { resultat: 'solde' };
		if (tx.statut === 'success') {
			const u = await getUserById(session.userId);
			return { resultat: 'succes', nouveauSolde: u?.credits ?? session.credits };
		}

		// Règles FACTICES pour tester chaque cas (mode test). En réel : code → agrégateur.
		if (code === '0000') {
			// Code incorrect : la transaction RESTE en attente, l'utilisateur réessaie.
			return { resultat: 'refuse' };
		}
		if (code === '1111') {
			// Solde insuffisant : terminal (échec).
			await echouerRecharge(ref);
			return { resultat: 'solde' };
		}

		// Tout autre code → confirmation. Idempotent : deux confirmations, un seul crédit.
		const { credite, doubleConfirmation } = await confirmerRecharge(ref);
		if (credite === 0 && !doubleConfirmation) return { resultat: 'expire' };
		const u = await getUserById(session.userId);
		return { resultat: 'succes', nouveauSolde: u?.credits ?? session.credits };
	}
};
