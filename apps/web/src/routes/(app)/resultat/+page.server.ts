import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	getTicket,
	updateTicket,
	saveAnalysisText,
	getAnalysisText
} from '$lib/server/fixtures/ticketStore';
import { listHistoryMarquee } from '$lib/server/fixtures/historyStore';
import { getOrCreateShareCode } from '$lib/server/fixtures/shareStore';
import { consommerAnalyseOfferte, debiterCredits } from '$lib/server/fixtures/userStore';
import { getAppSession, hasRechargedCached } from '$lib/server/session';
import { predictions, writing, stats } from '$lib/server/services';
import { buildReinforced, isAnalysable } from '$lib/server/domain/ticket';
import { regimeOf } from '$lib/server/domain/regime';
import { computeCharge } from '$lib/server/domain/billing';
import { checkGeneratedText } from '$lib/server/domain/guards';
import type { WritingInput, AnalyseTexte, RetraitEnrichi } from '$lib/server/services/writing';
import {
	chanceSur,
	chanceSurMot,
	faitsDescriptifs,
	syntheseDeterministe
} from '$lib/server/services/writing/enrich';
import { serialiseAnalyse, parseAnalyse } from '$lib/server/services/writing/serialize';
import type { ExplicationVM, LineVM, Market, ResultVM, Selection } from '$lib/types';
import type { RaisonNonAnalyse } from '$lib/lineStatus';
import { uncoveredFamily, marketLabelFr } from '$lib/server/domain/market-map';
import { multiplicateurRetrait, autresIssues } from '$lib/server/domain/resultDisplay';

// Fenêtre d'exécution de la fonction Vercel. La PREMIÈRE analyse rédige via l'IA
// (writeSafely, ≤ 20 s d'AbortController) ; sans ce réglage, la valeur par défaut
// de la plateforme (≈10 s) couperait la fonction avant notre garde-fou → 504 puis
// résultat au rafraîchissement. Les re-vues ne rappellent plus l'IA (texte figé),
// donc 60 s n'est jamais approché en régime normal — c'est une borne, pas un budget.
export const config = { maxDuration: 60 };

/** Arrondi au dixième de pour-cent, cohérent avec l'affichage et les garde-fous. */
function pct1(prob: number): number {
	return Math.round(prob * 100 * 10) / 10;
}

/**
 * Raison PRÉCISE de non-analyse d'une ligne, pour l'affichage honnête (jamais une
 * raison approximative quand on connaît la vraie). Résolue mais sans probabilité en
 * base → `sans_donnee` ; sinon on reprend la raison de résolution. `undefined` si
 * la ligne EST analysée.
 */
function raisonNonAnalyseDe(s: Selection): RaisonNonAnalyse | undefined {
	if (isAnalysable(s)) return undefined;
	return s.raison ?? 'sans_donnee';
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
		// Repli SANS IA : on passe par la synthèse déterministe, qui distingue « tout
		// solide » de « toutes fragiles ». Un texte codé en dur ici (« tient debout »)
		// pouvait contredire le verdict quand une sélection est fragile.
		synthese: input.rienARetirer
			? syntheseDeterministe(input)
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

	// 1. Lire les probabilités en table (jamais de calcul ici — règle d'archi n°2), en
	//    UNE requête pour tout le ticket (avant : un `predictions.get` PAR ligne = N+1,
	//    la cause de lenteur du résultat sur 3G, comme sur le dashboard).
	const fixtureIds = [
		...new Set(
			ticket.selections
				.filter((s) => s.etatResolution === 'certain' && s.fixtureId !== null && s.marche !== null)
				.map((s) => s.fixtureId)
				.filter((x): x is number => x !== null)
		)
	];
	const predsParMatch = await predictions.forFixtures(fixtureIds);
	const withProbs: Selection[] = ticket.selections.map((s) => {
		if (s.etatResolution !== 'certain' || s.fixtureId === null || s.marche === null) return s;
		// Match/marché absent de predictions → probabilité null : non analysé, non
		// facturé, jamais retiré (règles d'archi). On lit, on ne devine pas. `source`
		// décide le régime (mesure vs cote) : le texte et les faits en dépendent.
		const p = (predsParMatch.get(s.fixtureId) ?? []).find((pr) => pr.marche === s.marche) ?? null;
		return {
			...s,
			probabilite: p?.probabilite ?? null,
			seuilFragile: p?.seuilFragile ?? null,
			source: p?.source ?? null
		};
	});

	// 2. Produit, marquage fragile PAR MARCHÉ, renforcé par retrait (plancher 1).
	const r = buildReinforced(withProbs);
	// « Analysable » = résolu ET dont la probabilité EXISTE en base (règle UNIQUE,
	// `isAnalysable`). Une ligne résolue mais sans prédiction n'est PAS analysable :
	// on ne la compte ni pour la facturation, ni dans « X matchs sur Y », ni dans le
	// pourcentage. On vérifie la disponibilité AVANT de compter, jamais après.
	const nbAnalysables = withProbs.filter(isAnalysable).length;
	const nbTotal = r.selections.length;

	// Ligne « pas encore de données » = résolue, marché COUVERT, mais probabilité
	// absente en base : trou TRANSITOIRE de notre côté (collecteur/nocturne pas encore
	// passé). `raisonNonAnalyseDe` ne renvoie 'sans_donnee' QUE dans ce cas — les cas
	// DÉFINITIFS (hors catalogue, pari non couvert, déjà commencé, hors fenêtre) portent
	// leur propre raison et ne déclenchent NI la gratuité NI la promesse de retour.
	const nbSansDonnee = r.selections.filter((s) => raisonNonAnalyseDe(s) === 'sans_donnee').length;
	const donneesIncompletes = nbSansDonnee > 0;

	// La ligne analysable la plus SERRÉE (probabilité la plus basse) quand rien n'est
	// retiré — fait calculé en code (min sur des probabilités lues), jamais un conseil.
	// Calculée dès 1 ligne analysable : le cas « retrait bloqué » (une seule ligne,
	// fragile) en a besoin. Le cas « tient debout » n'en affiche qu'avec ≥ 2 (géré à
	// l'affichage). Aucun nombre nouveau : pct1 d'une proba déjà lue.
	const analysablesNonRetirees = r.selections.filter((s) => isAnalysable(s) && !s.retireeDuRenforce);
	const laPlusSerree =
		r.rienARetirer && analysablesNonRetirees.length >= 1
			? analysablesNonRetirees.reduce((min, s) =>
					(s.probabilite ?? 1) < (min.probabilite ?? 1) ? s : min
				)
			: null;

	// Compteurs/pourcentages DÉTERMINISTES (sans IA) : synthèse, VM, figeage.
	const probaTotalePct = pct1(r.probaTotale);
	const probaRenforceePct = pct1(r.probaRenforcee);
	const nbRetirees = r.retirees.length;
	const nbFragiles = r.selections.filter((s) => s.fragile).length;

	// 3. Texte deux niveaux. RÈGLE de stabilité : on ne rappelle JAMAIS l'IA pour un
	//    ticket DÉJÀ analysé. Le texte est FIGÉ à la première analyse et relu à
	//    l'identique — ce qui (a) rend le résultat immuable au rafraîchissement, et
	//    (b) retire l'appel IA du chemin de re-vue, une cause directe de 504/latence.
	//    Seule la PREMIÈRE analyse enrichit (faits, lecture stats) et rédige.
	let analyse: AnalyseTexte;
	if (ticket.billing) {
		const fige = parseAnalyse(await getAnalysisText(ticket.id));
		analyse = fige ?? {
			// Texte figé introuvable (vieux ticket) : synthèse déterministe, sans IA.
			synthese: syntheseDeterministe({
				probaTotalePct, probaRenforceePct, nbRetirees, nbMatchs: nbAnalysables,
				nbFragiles, retraits: [], rienARetirer: r.rienARetirer,
				toutesFragiles: r.toutesFragiles
			}),
			parSelection: []
		};
	} else {
		// On explique CHAQUE sélection retirée, enrichie de faits DESCRIPTIFS lus en
		// base — SEULEMENT en régime MESURE (en cote, aucun historique : faits vides,
		// aveu honnête « d'après les cotes »). Faits jamais recalculés ici.
		const retirees = r.selections.filter((s) => s.retireeDuRenforce);
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
			// Cote lue sur la capture (jamais calculée) — pour la traduction pédagogique.
			cote: s.coteSaisie,
			faits:
				regimeOf(s.source) === 'mesure' && s.fixtureId !== null
					? faitsDescriptifs(faitsParMatch.get(s.fixtureId), s.marche)
					: []
		}));
		const writingInput: WritingInput = {
			probaTotalePct, probaRenforceePct, nbRetirees, nbMatchs: nbAnalysables,
			nbFragiles, retraits, rienARetirer: r.rienARetirer,
			toutesFragiles: r.toutesFragiles
		};
		analyse = await writeSafely(writingInput, ticketNames(r.selections));
	}

	// 4. Facturation (règle : débit à l'affichage réussi, jamais avant, une fois).
	//    Idempotent : une fois `billing` posé, on ne recalcule ni ne redébite.
	let billing = ticket.billing;
	if (!billing) {
		// Gratuités permanentes d'abord (tout solide, moins de 3, même ticket 24 h).
		// Le ticket substantiel qui SERAIT facturé ouvre le dernier recours : l'analyse
		// OFFERTE (bêta), consommée ATOMIQUEMENT — jamais gaspillée sur un ticket déjà
		// gratuit. Le garde est le compteur PAR COMPTE ; l'empreinte d'appareil est
		// relâchée pendant la bêta (voir README, dette de bêta), la vraie défense
		// multi-compte étant le rate-limit de /analyser (C1).
		let charge = computeCharge({
			nbAnalysables,
			rienARetirer: r.rienARetirer,
			toutesFragiles: r.toutesFragiles,
			donneesIncompletes
		});

		if (!charge.gratuit && !charge.bloque) {
			const offerte = session.analysesOffertesRestantes > 0 && (await consommerAnalyseOfferte(session.userId));
			if (offerte) {
				charge = { gratuit: true, raison: 'offerte', credits: 0, bloque: false };
			} else {
				const cost = charge.credits ?? 0;
				// Débit ATOMIQUE : une seule requête décide ET applique, en enforçant le
				// solde AU NIVEAU BASE (`credits >= cost`). On ne se fie plus au solde de
				// SESSION (périmé) : deux affichages concurrents ne peuvent plus payer deux
				// analyses avec le même solde de départ. false → solde insuffisant, on
				// bloque l'affichage (jamais l'entrée) en redirigeant vers la recharge.
				const debite = await debiterCredits(session.userId, cost, ticket.id);
				if (!debite) {
					redirect(303, `/recharge?besoin=${cost}&retour=/resultat`);
				}
			}
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
			result: { probaTotalePct, probaRenforceePct, nbRetirees, nbFragiles }
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
		// Booléen calculé UNE fois par la règle unique : le client ne re-dérive jamais.
		analysable: isAnalysable(s),
		// Probabilité par ligne : lue en table (jamais calculée ici), affichée dans
		// la lecture détaillée. null quand la sélection n'est pas analysable.
		probabilitePct: typeof s.probabilite === 'number' ? pct1(s.probabilite) : null,
		// Raison EXACTE de non-analyse (déjà commencé, hors catalogue…) pour ne jamais
		// afficher une cause approximative. Absente quand la ligne est analysée.
		raisonNonAnalyse: raisonNonAnalyseDe(s),
		// Non couvert : on NOMME la famille (mi-temps, buteurs…) depuis le texte lu.
		familleNonCouverte:
			raisonNonAnalyseDe(s) === 'non_couvert' ? uncoveredFamily(s.texteBrut) : null
	}));

	// FEATURE 2 — autres issues du MÊME match pour chaque ligne RETIRÉE. Lecture SEULE
	// de la base (predictions.forFixtures), jamais un calcul ni une proba dérivée à la
	// volée : on MONTRE ce qu'on sait, on ne suggère rien (règles d'or n°1/n°3). Même
	// source que la ligne jouée → aucune impression d'analyse plus riche. Vaut aussi en
	// cote seule (1X2 + DC dérivée en base), où le TEXTE reste « d'après les cotes ».
	const retireesVoisins = r.selections.filter(
		(s) => s.retireeDuRenforce && isAnalysable(s) && s.fixtureId !== null && s.marche !== null
	);
	const voisinFixtureIds = [...new Set(retireesVoisins.map((s) => s.fixtureId as number))];
	const predsParFixture = voisinFixtureIds.length
		? await predictions.forFixtures(voisinFixtureIds)
		: new Map();
	const autresParOrdre = new Map<number, { libelleFr: string; probabilitePct: number }[]>();
	for (const s of retireesVoisins) {
		const preds = predsParFixture.get(s.fixtureId as number) ?? [];
		// matchLabel = « Home – Away » (resolve.ts) : on en tire les deux équipes pour
		// libeller « X gagne » / « X ou nul ». Split défensif : sans les deux, on n'affiche
		// que les issues sans nom d'équipe (nul, plus/moins).
		const parts = s.matchLabel.split(' – ');
		const [home, away] = parts.length === 2 ? parts : ['', ''];
		const issues = autresIssues(s.marche as Market, preds).map((iss) => ({
			libelleFr: marketLabelFr(iss.marche, home, away),
			probabilitePct: pct1(iss.probabilite)
		}));
		if (issues.length) autresParOrdre.set(s.ordre, issues);
	}

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
				texte: p.texte,
				autresIssues: autresParOrdre.get(p.ordre) ?? []
			} satisfies ExplicationVM;
		})
		.filter((x): x is ExplicationVM => x !== null)
		.sort((a, b) => a.ordre - b.ordre);

	// AUCUNE ligne analysable : on ne laisse JAMAIS passer le « tient debout » du
	// rédacteur (rienARetirer est vrai par vacuité). On dit la vérité, en une phrase ;
	// le détail (pourquoi chaque ligne, ce qu'on couvre, gratuité) est dans le bloc dédié.
	const aucunAnalysable = nbAnalysables === 0;
	const syntheseFinale = aucunAnalysable
		? "Aucun de tes paris n'entre dans ce qu'on analyse."
		: analyse.synthese;

	const vm: ResultVM = {
		lignes,
		probaTotalePct,
		probaRenforceePct,
		nbRetirees,
		// FEATURE 1 — effet du retrait « N fois plus de chances », calcul en code sur les
		// probabilités BRUTES (jamais le rédacteur). Rien sans retrait, rien si l'effet
		// est invisible à l'affichage. Le pourcentage reste toujours affiché à côté.
		multiplicateur: multiplicateurRetrait(r.probaTotale, r.probaRenforcee, !r.rienARetirer),
		synthese: syntheseFinale,
		aucunAnalysable,
		explications,
		rienARetirer: r.rienARetirer,
		toutesFragiles: r.toutesFragiles,
		// Plus de la moitié des analysables retirées (strictement) → on prévient.
		majoriteRetiree: nbRetirees * 2 > nbAnalysables,
		conflitMemeMatch: r.conflitMemeMatch,
		nbAnalysables,
		nbTotal,
		laPlusSerree: laPlusSerree
			? {
					matchLabel: laPlusSerree.matchLabel || laPlusSerree.texteBrut,
					libelleFr: laPlusSerree.libelleFr,
					pct: pct1(laPlusSerree.probabilite as number)
				}
			: null
	};
	// Trois lectures INDÉPENDANTES entre elles → en PARALLÈLE (avant : trois attentes
	// en série). `hasRechargedCached` réutilise la promesse déjà lancée par le layout
	// (plus de double `count`).
	//  - bandeau d'historique : affiché seulement si ≥ 20 résultats réels (sinon absent) ;
	//  - lien de partage court et unique (n'expose aucune donnée de compte) ;
	//  - a-t-il déjà rechargé (invitation à recharger).
	const [histo, code, dejaRecharge] = await Promise.all([
		listHistoryMarquee(40),
		getOrCreateShareCode(ticket.id),
		hasRechargedCached(event, session.userId)
	]);
	const historique = histo.length >= 20 ? histo : [];
	const shareUrl = `${event.url.origin}/p/${code}`;
	const shareImage = `${event.url.origin}/p/${code}/image`;

	// Invitation à recharger : seulement une fois l'analyse offerte terminée et
	// tant que l'utilisateur n'a pas encore rechargé — jamais avant le résultat.
	// Réutilisation VISIBLE : arrivée via `?reutilise=1` (même capture déjà analysée).
	// On l'affiche pour que l'utilisateur sache qu'il n'est PAS refacturé (le piège
	// qui coûtait du temps). `analyseLeMs` alimente le « il y a X ».
	const reutilise = event.url.searchParams.get('reutilise') === '1';
	return {
		ticketId: ticket.id,
		vm,
		gratuit: billing.gratuit,
		montreRecharge: !dejaRecharge,
		historique,
		shareUrl,
		shareImage,
		reutilise,
		// Trou de données TRANSITOIRE au moment de l'analyse : ticket non facturé, et on
		// invite au retour (gratuit sous 24 h). Recalculé à chaque vue : le message
		// disparaît de lui-même dès que la prédiction est arrivée en base.
		donneesIncompletes,
		nbSansDonnee,
		analyseLeMs: ticket.creeLeMs
	};
};

// L'autorisation de notification passe désormais par le NAVIGATEUR (Web Push réel,
// permission + abonnement côté client → POST /api/push/subscribe). Plus d'action
// serveur factice « notifier » : la demande se fait au clic, sur l'écran de résultat.

