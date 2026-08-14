import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getTicket, updateTicket, saveAnalysisText } from '$lib/server/fixtures/ticketStore';
import { listHistoryMarquee } from '$lib/server/fixtures/historyStore';
import { getOrCreateShareCode } from '$lib/server/fixtures/shareStore';
import { hasRecharged, markPremierTicketUtilise, record } from '$lib/server/fixtures/userStore';
import { getAppSession } from '$lib/server/session';
import { predictions, writing, notifications, stats } from '$lib/server/services';
import { buildReinforced } from '$lib/server/domain/ticket';
import { regimeOf } from '$lib/server/domain/regime';
import { computeCharge } from '$lib/server/domain/billing';
import { hasConsumedOffer, recordOfferConsumed } from '$lib/server/fixtures/offeredDeviceStore';
import { checkGeneratedText } from '$lib/server/domain/guards';
import type { WritingInput, AnalyseTexte, RetraitEnrichi } from '$lib/server/services/writing';
import { chanceSur, chanceSurMot, faitsDescriptifs } from '$lib/server/services/writing/enrich';
import { serialiseAnalyse } from '$lib/server/services/writing/serialize';
import type { ExplicationVM, LineVM, ResultVM, Selection } from '$lib/types';

/** Arrondi au dixième de pour-cent, cohérent avec l'affichage et les garde-fous. */
function pct1(prob: number): number {
	return Math.round(prob * 100 * 10) / 10;
}

// Compteurs de bascule vers le template (par instance). Journalisés à chaque
// bascule AVEC la raison, pour qu'un taux qui remonte se voie — et s'explique —
// dans les logs, sans lire le code.
let genTotal = 0;
let genFallback = 0;

/** Texte à soumettre au garde-fou : synthèse + toutes les explications, d'un bloc. */
function textePlein(a: AnalyseTexte): string {
	return [a.synthese, ...a.parSelection.map((p) => p.texte)].join('\n');
}

/**
 * Rédaction sous garde-fous (brief §4.3/4.4) : on régénère si un nombre est
 * fabriqué, un terme interdit ou une tournure causale apparaît ; après 2 échecs,
 * un template sobre sans chiffres ni explications par sélection.
 * `maskNames` : noms propres du ticket retirés du texte avant le contrôle des
 * nombres (un « 05 » de « Mainz 05 » n'est pas un chiffre analytique).
 */
async function writeSafely(input: WritingInput, maskNames: string[]): Promise<AnalyseTexte> {
	genTotal += 1;
	let raison = 'echec_modele';
	let detail = '';
	for (let i = 0; i < 2; i++) {
		let texte: AnalyseTexte;
		try {
			texte = await writing.writeAnalysis(input);
		} catch (e) {
			raison = 'echec_modele';
			detail = String(e).slice(0, 120);
			continue;
		}
		const controle = checkGeneratedText(textePlein(texte), writing.allowedNumbers(input), maskNames);
		if (controle.ok) return texte;
		if (!controle.vocabulary.ok) {
			raison = 'vocabulaire_interdit';
			detail = controle.vocabulary.hits.join(',');
		} else if (!controle.causality.ok) {
			raison = 'formulation_causale';
			detail = controle.causality.hits.join(',');
		} else {
			raison = 'nombre_hors_autorises';
			detail = controle.numbers.offending.join(',');
		}
	}
	genFallback += 1;
	const taux = Math.round((genFallback / genTotal) * 100);
	console.warn(
		`[rédaction] bascule template ${genFallback}/${genTotal} (~${taux}%) ` +
			`raison=${raison} détail=${detail || '—'}`
	);
	return {
		synthese: input.rienARetirer
			? 'Rien à retirer. Ton ticket tient debout.'
			: 'On a repéré les sélections fragiles de ton ticket. Regarde la version renforcée.',
		parSelection: []
	};
}

/** Noms propres du ticket (libellés de match + équipes) à masquer au contrôle. */
function ticketNames(selections: Selection[]): string[] {
	const noms = new Set<string>();
	for (const s of selections) {
		const label = s.matchLabel?.trim();
		if (!label) continue;
		noms.add(label);
		for (const part of label.split(' – ')) {
			const p = part.trim();
			if (p) noms.add(p);
		}
	}
	return [...noms];
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
			// Match/marché absent de predictions → probabilité null : non analysé,
			// non facturé, jamais retiré (règles d'archi). On lit, on ne devine pas.
			// `source` décide le régime (mesure vs cote) : le texte et les faits en dépendent.
			return {
				...s,
				probabilite: p?.probabilite ?? null,
				seuilFragile: p?.seuilFragile ?? null,
				source: p?.source ?? null
			};
		})
	);

	// 2. Produit, marquage fragile PAR MARCHÉ, renforcé par retrait (plancher 4).
	const r = buildReinforced(withProbs);
	// « Analysable » = résolu ET dont la probabilité EXISTE en base. Une ligne
	// résolue mais sans prédiction (match/marché absent de `predictions`) n'est PAS
	// analysable : on ne la compte ni pour la facturation, ni dans « X matchs sur Y »,
	// ni dans le pourcentage. On vérifie la disponibilité AVANT de compter, jamais après.
	const nbAnalysables = withProbs.filter(
		(s) => s.etatResolution === 'certain' && s.probabilite != null
	).length;
	const nbTotal = r.selections.length;

	// « Ta sélection la plus serrée » : quand rien n'est retiré, on montre en INFO
	// NEUTRE la ligne analysable à la probabilité la plus basse — un fait calculé en
	// code (min sur des probabilités déjà affichées), jamais un conseil, jamais un
	// verbe d'action. On ne l'affiche qu'avec ≥ 2 lignes analysables (avec une seule,
	// « la plus serrée » n'a pas de sens). Aucun nombre nouveau : pct1 d'une proba lue.
	const analysablesNonRetirees = r.selections.filter(
		(s) => s.etatResolution === 'certain' && s.probabilite != null && !s.retireeDuRenforce
	);
	const laPlusSerree =
		r.rienARetirer && analysablesNonRetirees.length >= 2
			? analysablesNonRetirees.reduce((min, s) =>
					(s.probabilite ?? 1) < (min.probabilite ?? 1) ? s : min
				)
			: null;

	// 3. Rédaction sous garde-fous. On explique CHAQUE sélection retirée (badge
	//    rouge ou mention neutre), enrichie de faits DESCRIPTIFS lus en base
	//    (forme, buts domicile/extérieur, confrontations) — jamais recalculés ici.
	const retirees = r.selections.filter((s) => s.retireeDuRenforce);
	// On ne lit des FAITS que pour les sélections en régime MESURE (championnat
	// backtesté, historique football-data présent). En régime COTE, aucun historique :
	// on n'interroge même pas le service de stats, pour qu'il ne puisse renvoyer
	// aucune donnée partielle (CLAUDE.md, § deux régimes). Le rédacteur tombe alors
	// sur l'aveu honnête « d'après les cotes ».
	const fixtureIds = [
		...new Set(
			retirees
				.filter((s) => regimeOf(s.source) === 'mesure')
				.map((s) => s.fixtureId)
				.filter((x): x is number => x !== null)
		)
	];
	const faitsParMatch = await stats.forFixtures(fixtureIds);
	const retraits: RetraitEnrichi[] = retirees.map((s) => ({
		ordre: s.ordre,
		libelleFr: `${s.matchLabel} — ${s.libelleFr}`,
		avecBadge: s.fragile,
		chanceSur: chanceSur(s.probabilite ?? null),
		chanceSurMot: chanceSurMot(s.probabilite ?? null),
		// Faits ORIENTÉS : seulement ceux qui jouent contre la sélection jouée, et
		// SEULEMENT en régime mesure. En régime cote, faits vides → aveu honnête.
		faits:
			regimeOf(s.source) === 'mesure' && s.fixtureId !== null
				? faitsDescriptifs(faitsParMatch.get(s.fixtureId), s.marche)
				: []
	}));
	const writingInput: WritingInput = {
		probaTotalePct: pct1(r.probaTotale),
		probaRenforceePct: pct1(r.probaRenforcee),
		nbRetirees: r.retirees.length,
		nbMatchs: nbAnalysables,
		nbFragiles: r.selections.filter((s) => s.fragile).length,
		retraits,
		rienARetirer: r.rienARetirer
	};
	const analyse = await writeSafely(writingInput, ticketNames(r.selections));

	// 4. Facturation (règle : débit à l'affichage réussi, jamais avant, une fois).
	//    Idempotent : une fois `billing` posé, on ne recalcule ni ne redébite.
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
		// Fige le texte rendu (deux niveaux, sérialisé) : l'historique le relira à
		// vie, à l'identique, sans jamais refacturer ni régénérer.
		await saveAnalysisText(ticket.id, serialiseAnalyse(analyse));
		await updateTicket(ticket.id, {
			statut: 'analyse',
			billing,
			userId: session.userId,
			// FIGE l'état renforcé (fragile + retiré + proba) sur les sélections :
			// l'historique et l'image de partage relisent CES drapeaux. Sans ça, le
			// ticket renforcé s'affichait sans aucune ligne barrée (rien de persisté).
			selections: r.selections,
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
		// Retirée sans badge rouge (double chance, plus de 1,5) → mention neutre.
		mentionNeutre: s.retireeDuRenforce && !s.fragile,
		analysable: s.etatResolution === 'certain',
		// Probabilité par ligne : lue en table (jamais calculée ici), affichée dans
		// la lecture détaillée. null quand la sélection n'est pas analysable.
		probabilitePct: typeof s.probabilite === 'number' ? pct1(s.probabilite) : null
	}));

	// Explications par sélection retirée, rattachées à leur ligne (ordre, libellés,
	// badge) pour l'affichage — dans l'ordre du ticket.
	const parLigne = new Map(lignes.map((l) => [l.ordre, l]));
	const explications: ExplicationVM[] = analyse.parSelection
		.map((p) => {
			const l = parLigne.get(p.ordre);
			if (!l) return null;
			return {
				ordre: p.ordre,
				matchLabel: l.matchLabel,
				libelleFr: l.libelleFr,
				avecBadge: l.fragile,
				texte: p.texte
			} satisfies ExplicationVM;
		})
		.filter((x): x is ExplicationVM => x !== null)
		.sort((a, b) => a.ordre - b.ordre);

	const vm: ResultVM = {
		lignes,
		probaTotalePct: writingInput.probaTotalePct,
		probaRenforceePct: writingInput.probaRenforceePct,
		nbRetirees: writingInput.nbRetirees,
		synthese: analyse.synthese,
		explications,
		rienARetirer: r.rienARetirer,
		conflitMemeMatch: r.conflitMemeMatch,
		nbAnalysables,
		nbTotal,
		laPlusSerree: laPlusSerree
			? {
					matchLabel: laPlusSerree.matchLabel || laPlusSerree.texteBrut,
					pct: pct1(laPlusSerree.probabilite as number)
				}
			: null
	};
	// Bandeau d'historique : sélections déjà marquées, matchs terminés, issue
	// réelle. On ne l'affiche QUE s'il y a au moins 20 résultats en base — sinon,
	// aucun remplissage de démonstration (le bandeau reste absent).
	const histo = await listHistoryMarquee(40);
	const historique = histo.length >= 20 ? histo : [];

	// Lien de partage court et unique (n'expose aucune donnée de compte).
	const code = await getOrCreateShareCode(ticket.id);
	const shareUrl = `${event.url.origin}/p/${code}`;
	const shareImage = `${event.url.origin}/p/${code}/image`;

	// Invitation à recharger : seulement une fois l'analyse offerte terminée et
	// tant que l'utilisateur n'a pas encore rechargé — jamais avant le résultat.
	return {
		ticketId: ticket.id,
		vm,
		gratuit: billing.gratuit,
		montreRecharge: !(await hasRecharged(session.userId)),
		historique,
		shareUrl,
		shareImage
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

