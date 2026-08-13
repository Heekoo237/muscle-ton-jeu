import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PACKS, featuredPack } from '$lib/server/domain/billing';
import { payment } from '$lib/server/services';
import { getAppSession } from '$lib/server/session';
import { trackRecharge } from '$lib/server/fixtures/rechargeStore';

function safeReturn(url: URL): string {
	const r = url.searchParams.get('retour');
	return r && r.startsWith('/') ? r : '/dashboard';
}

export const load: PageServerLoad = async (event) => {
	const session = await getAppSession(event);
	if (!session) redirect(303, '/connexion?retour=/recharge');
	const { url } = event;
	const besoin = Number(url.searchParams.get('besoin')) || 0;
	// Message honnête quand le ticket offert a déjà servi sur l'appareil : aucun
	// reproche, juste le fait et la sortie (recharge).
	const message =
		url.searchParams.get('motif') === 'empreinte'
			? 'Le ticket offert a déjà été utilisé sur cet appareil. Recharge à partir de 500 F pour continuer.'
			: null;
	return {
		besoin, // > 0 quand on arrive par le blocage d'affichage
		credits: session.credits,
		retour: safeReturn(url),
		packs: PACKS,
		featured: besoin > 0 ? featuredPack(besoin) : 'ticket',
		message
	};
};

export const actions: Actions = {
	// Lance un paiement Mobile Money (asynchrone). On ne crédite pas ici : la
	// confirmation peut prendre jusqu'à 40 s (PRD §8.6). Le crédit est posé à la
	// confirmation, sur la page d'attente.
	payer: async (event) => {
		const session = await getAppSession(event);
		if (!session) redirect(303, '/connexion?retour=/recharge');
		const form = await event.request.formData();
		const packId = String(form.get('pack'));
		const msisdn = String(form.get('msisdn') ?? '').trim();
		const retourRaw = String(form.get('retour') ?? '');
		const retour = retourRaw.startsWith('/') ? retourRaw : '/dashboard';
		const pack = PACKS.find((p) => p.id === packId);
		if (!pack) return fail(400, { message: 'Pack inconnu' });

		const credits = pack.credits === 'illimite' ? 999 : pack.credits;
		const intent = await payment.initiate({
			userId: session.userId,
			montant: pack.prix,
			credits,
			msisdn
		});

		await trackRecharge(intent.txnId, { credits, montant: pack.prix, userId: session.userId });
		const q = new URLSearchParams({ txn: intent.txnId, retour });
		redirect(303, `/recharge/attente?${q.toString()}`);
	}
};
