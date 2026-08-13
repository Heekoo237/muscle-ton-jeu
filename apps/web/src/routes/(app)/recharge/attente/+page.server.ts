import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { payment } from '$lib/server/services';
import { getRecharge, markCredited } from '$lib/server/fixtures/rechargeStore';
import { record } from '$lib/server/fixtures/userStore';

/**
 * Attente active de la confirmation Mobile Money (5–40 s, PRD §8.6). Sans JS :
 * la page se rafraîchit toute seule tant que c'est en attente. À la confirmation,
 * on crédite UNE fois puis on revient exactement sur le ticket (via `retour`).
 */
export const load: PageServerLoad = async ({ url }) => {
	const txn = url.searchParams.get('txn') ?? '';
	const retourRaw = url.searchParams.get('retour') ?? '';
	const retour = retourRaw.startsWith('/') ? retourRaw : '/dashboard';

	const rech = await getRecharge(txn);
	if (!rech) redirect(303, '/recharge');

	const status = await payment.status(txn);

	if (status === 'success') {
		if (!rech.credited) {
			await record(rech.credits, 'recharge'); // crédit posé à la confirmation, une fois
			await markCredited(txn);
		}
		redirect(303, retour); // retour exact sur le ticket
	}

	return { status };
};
