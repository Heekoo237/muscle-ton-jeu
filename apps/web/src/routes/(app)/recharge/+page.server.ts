import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PACKS } from '$lib/server/domain/billing';
import { ANALYSES_OFFERTES, libelleOffertes } from '$lib/offer';
import { getAppSession } from '$lib/server/session';
import { creerTransaction, rechargeEnCours } from '$lib/server/fixtures/rechargeStore';
import { paiementActif, paiementModeTest } from '$lib/server/paymentMode';
import { supportLink } from '$lib/support';
import { PAYS_DEFAUT, paysDe, validerNumero, operateurDe, msisdnComplet } from '$lib/payments/operators';

function safeReturn(url: URL): string {
	const r = url.searchParams.get('retour');
	return r && r.startsWith('/') ? r : '/dashboard';
}

export const load: PageServerLoad = async (event) => {
	const session = await getAppSession(event);
	if (!session) redirect(303, '/connexion?retour=/recharge');
	const { url, cookies } = event;
	const besoin = Number(url.searchParams.get('besoin')) || 0;
	const paiement = paiementActif();

	// BÊTA — le paiement n'est pas branché. Plutôt qu'un formulaire de recharge en
	// cul-de-sac (qui échouerait en « pas disponible »), on affiche un message franc
	// + un lien support WhatsApp : on crédite les testeurs à la main, et surtout on
	// apprend QUI veut continuer (information précieuse). Voir +page.svelte.
	const message =
		!paiement && session.analysesOffertesRestantes === 0
			? `Tu as utilisé tes ${libelleOffertes(ANALYSES_OFFERTES)}. Le paiement arrive bientôt — écris-nous si tu veux continuer à tester.`
			: besoin > 0 && session.analysesOffertesRestantes === 0
				? `Tu as utilisé tes ${libelleOffertes(ANALYSES_OFFERTES)}. Recharge à partir de 500 F pour continuer.`
				: null;
	const supportUrl = supportLink(
		'Bonjour, j’ai utilisé mes analyses offertes et je veux continuer à tester Muscle Ton Jeu.'
	);

	// Une recharge déjà en cours ? On le dit et on offre de la reprendre (au lieu d'en
	// lancer une seconde — cf. garde double-recharge dans l'action).
	const enCours = await rechargeEnCours(session.userId);

	return {
		besoin,
		credits: session.credits,
		retour: safeReturn(url),
		packs: PACKS,
		message,
		paysDefaut: cookies.get('mtj_pays') || PAYS_DEFAUT, // mémorisé d'une recharge à l'autre
		paiementActif: paiement,
		supportUrl,
		modeTest: paiementModeTest(),
		enCours: enCours ? { reference: enCours.reference } : null
	};
};

export const actions: Actions = {
	payer: async (event) => {
		const session = await getAppSession(event);
		if (!session) redirect(303, '/connexion?retour=/recharge');

		// Paiement indisponible (prod sans agrégateur réel ni mode test) : message clair,
		// jamais une 500 brute (c'était le bug — le factice refusé levait une erreur).
		if (!paiementActif()) {
			return fail(503, { message: 'Le paiement Mobile Money n’est pas encore disponible. Reviens bientôt.' });
		}

		// GARDE DOUBLE-RECHARGE : une seule transaction en cours par utilisateur.
		const dejaEnCours = await rechargeEnCours(session.userId);
		if (dejaEnCours) {
			return fail(409, {
				message: 'Une recharge est déjà en cours. Termine-la ou attends son expiration.',
				reference: dejaEnCours.reference
			});
		}

		const form = await event.request.formData();
		const paysCode = String(form.get('pays') ?? '');
		const numero = String(form.get('numero') ?? '');
		const operateurId = String(form.get('operateur') ?? '');
		const packId = String(form.get('pack') ?? '');

		const pays = paysDe(paysCode);
		if (!pays) return fail(400, { message: 'Choisis ton pays.' });
		const num = validerNumero(numero, pays);
		if (!num.ok) return fail(400, { message: num.message || 'Entre ton numéro Mobile Money.' });
		const operateur = operateurDe(pays, operateurId);
		if (!operateur) return fail(400, { message: 'Choisis ton opérateur.' });
		const pack = PACKS.find((p) => p.id === packId);
		if (!pack) return fail(400, { message: 'Choisis un montant.' });

		// Mémorise le pays pour les prochaines recharges.
		event.cookies.set('mtj_pays', pays.code, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: false, sameSite: 'lax' });

		const credits = pack.credits === 'illimite' ? 999 : pack.credits;
		const tx = await creerTransaction({
			userId: session.userId,
			montant: pack.prix,
			credits,
			pays: pays.code,
			operateur: operateur.id,
			msisdn: msisdnComplet(pays, num.valeur)
		});

		const retourRaw = String(form.get('retour') ?? '');
		const retour = retourRaw.startsWith('/') ? retourRaw : '/dashboard';
		redirect(303, `/recharge/attente?ref=${tx.reference}&retour=${encodeURIComponent(retour)}`);
	}
};
