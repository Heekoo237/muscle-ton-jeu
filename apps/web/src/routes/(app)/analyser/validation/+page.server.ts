import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getTicket, updateTicket } from '$lib/server/fixtures/ticketStore';
import { marketLabelFr, uncoveredFamily } from '$lib/server/domain/market-map';
import { creditCost, isAnalysable } from '$lib/server/domain/ticket';
import type { UncoveredFamily } from '$lib/lineStatus';
import { predictions, sports } from '$lib/server/services';
import {
	remplirCotesManquantes,
	remplirMatchsNonResolus,
	nouveauBudget,
	type PickCible,
	type PhaseOndemand
} from '$lib/server/odds/ondemand';
import type { Market, Selection } from '$lib/types';
import { COVERED_MARKETS } from '$lib/types';

// Fenêtre d'exécution : le chargement de la validation lance désormais l'à-la-demande
// (borné < 2 s par le budget dur). On garde une marge large au-dessus du budget pour
// ne jamais être coupé par la valeur par défaut de la plateforme avant nos garde-fous.
export const config = { maxDuration: 30 };

/**
 * COMBLE le ticket à la demande — la MÊME opération aux DEUX moments : au CHARGEMENT
 * de la validation (pour que l'aperçu « Analyser N sur M » soit juste) ET au
 * « finaliser ». Deux passes, un seul budget DUR partagé : cotes manquantes des
 * marchés joués (dont BTTS/±1,5/±3,5, jamais écrits par le pipeline), puis matchs
 * non résolus. Écrit dans `predictions` (effet partagé) ; la dédup (`revendiquer`,
 * 15 min + marchés déjà connus) fait que la phase suivante NE RAPPELLE PAS le
 * fournisseur pour ce qui est déjà demandé — d'où le tag `phase` au journal.
 * Ne lève jamais ; un échec retombe sur « pas encore de données ».
 */
async function comblerTicket(
	selections: Selection[],
	budget: ReturnType<typeof nouveauBudget>,
	phase: PhaseOndemand
): Promise<{ selections: Selection[]; appels: number; credits: number }> {
	const picks: PickCible[] = selections
		.filter((s) => s.fixtureId !== null && s.marche !== null)
		.map((s) => ({ fixtureId: s.fixtureId as number, marche: s.marche as Market }));
	const j1 = await remplirCotesManquantes(picks, budget, phase);

	let out =
		j1.nonCotes.size > 0
			? selections.map((s) =>
					s.fixtureId !== null && j1.nonCotes.has(s.fixtureId)
						? { ...s, raison: 'non_cote' as const }
						: s
				)
			: selections;

	let appels = j1.appels;
	let credits = j1.credits;
	if (out.some((s) => s.raison === 'non_resolu' && s.fixtureId === null)) {
		const [fixtures, teams] = await Promise.all([sports.resolutionFixtures(), sports.teams()]);
		const j2 = await remplirMatchsNonResolus(out, teams, fixtures, budget, phase);
		out = j2.selections;
		appels += j2.journal.appels;
		credits += j2.journal.credits;
	}
	console.log(`[${phase}] à-la-demande : ${appels} appel(s) fournisseur, ${credits} crédit(s)`);
	return { selections: out, appels, credits };
}

/**
 * Analysable EN BASE : on lit la probabilité de la ligne, puis on tranche avec la
 * règle UNIQUE `isAnalysable`. Une ligne résolue sans prédiction n'est PAS
 * analysable : on ne la compte ni comme « match sur Y », ni pour la facturation.
 * On vérifie la disponibilité de la probabilité AVANT de compter, jamais après —
 * sinon l'écran de validation promet une analyse que le résultat ne peut pas tenir.
 * On lit la table, on ne devine rien (règle d'archi n°2).
 */
async function analysableEnBase(s: Selection): Promise<boolean> {
	if (s.fixtureId === null || s.marche === null) return false;
	const p = await predictions.get(s.fixtureId, s.marche);
	return isAnalysable({ ...s, probabilite: p?.probabilite ?? null });
}

/** Découpe « Home – Away » pour reconstruire le libellé après correction. */
function teamsOf(matchLabel: string): [string, string] {
	const [home, away] = matchLabel.split(' – ');
	return [home ?? '', away ?? ''];
}

export interface MarketOption {
	market: Market;
	label: string;
}

export interface ValidationLineVM extends Selection {
	/** Tous les paris possibles du match, pour la feuille de correction. */
	options: MarketOption[];
	/** Résolue ET avec probabilité en base : seule une ligne analysable est comptée. */
	analysable: boolean;
	/** Si non couvert : la famille (mi-temps, buteurs…) pour nommer le refus. */
	familleNonCouverte?: UncoveredFamily | null;
}

export const load: PageServerLoad = async ({ cookies }) => {
	const id = cookies.get('ticketId');
	const ticket = id ? await getTicket(id) : undefined;
	if (!ticket) redirect(303, '/analyser');

	// PRÉ-REMPLISSAGE à la demande DÈS LE CHARGEMENT : les marchés événement (BTTS,
	// ±1,5, ±3,5) ne sont JAMAIS écrits par le pipeline — seule cette récupération les
	// pose. Sans elle, une ligne jouée sur ces marchés affichait « pas encore de
	// données » à tort et faussait le « Analyser N sur M » — le PREMIER chiffre que
	// l'utilisateur regarde. On comble donc ici (budget DUR < 2 s ; en cas de dépassement
	// on retombe simplement sur « pas encore de données », jamais d'écran figé). La dédup
	// (15 min) fait que le « finaliser » ne rappellera PAS le fournisseur pour ça.
	const { selections: base } = await comblerTicket(ticket.selections, nouveauBudget(), 'validation');

	// Disponibilité de la probabilité vérifiée EN AMONT, en UNE requête pour tout le
	// ticket (avant : une lecture predictions PAR ligne = N+1, lent sur 3G). On lit le
	// lot, puis on tranche par ligne avec la règle UNIQUE `isAnalysable`.
	const fixtureIds = [
		...new Set(base.map((s) => s.fixtureId).filter((x): x is number => x !== null))
	];
	const preds = await predictions.forFixtures(fixtureIds);
	const flags = await Promise.all(
		base.map(async (s) => {
			if (s.fixtureId === null || s.marche === null) return false;
			const dansLot = (preds.get(s.fixtureId) ?? []).find((pr) => pr.marche === s.marche) ?? null;
			if (isAnalysable({ ...s, probabilite: dansLot?.probabilite ?? null })) return true;

			// TROU APPARENT : le lot (forFixtures) n'a pas renvoyé de proba pour cette ligne
			// résolue. Deux causes possibles, qu'on TRANCHE ici plutôt que de deviner —
			// c'est le symptôme « pas encore de données qui passe au vert au clic ». On
			// refait la lecture CIBLÉE (get, comme le fait le clic) UNIQUEMENT sur les trous
			// (0-2 lignes en général, coût négligeable) :
			//  - si `get` trouve la proba que le lot n'avait pas → INCOHÉRENCE lot/ciblé :
			//    une lecture de collection tronque encore (écriture concurrente pendant la
			//    pagination, ou « Max Rows » abaissé sous PAGE). On JOURNALISE fort ET on
			//    soigne (on affiche le vrai état, plus de faux « pas encore de données ») ;
			//  - si `get` ne trouve rien non plus → le marché LU n'a réellement pas de ligne
			//    (régime cote seule : l'intérim n'écrit qu'un sous-ensemble de marchés).
			//    C'est ce que la récupération à la demande comble au « finaliser ». On le dit.
			const ciblee = s.marche !== null ? await predictions.get(s.fixtureId, s.marche) : null;
			const marchesDuLot = (preds.get(s.fixtureId) ?? []).map((pr) => pr.marche);
			if (ciblee && typeof ciblee.probabilite === 'number') {
				console.warn(
					`[validation] INCOHÉRENCE lot/ciblé — fixture=${s.fixtureId} marché=${s.marche} : ` +
						`le lot forFixtures n'a PAS renvoyé la proba (marchés vus: ${JSON.stringify(marchesDuLot)}), ` +
						`mais get la trouve (p=${ciblee.probabilite}). Lecture de collection tronquée ?`
				);
				return isAnalysable({ ...s, probabilite: ciblee.probabilite });
			}
			console.log(
				`[validation] TROU RÉEL — fixture=${s.fixtureId} marché=${s.marche} : aucune proba ` +
					`(ni lot ni get). Marchés présents pour ce match: ${JSON.stringify(marchesDuLot)}. ` +
					`Comblé au « finaliser » (récupération à la demande) si le fournisseur price ce marché.`
			);
			return false;
		})
	);
	// Chaque ligne est corrigeable : on précalcule tous les marchés couverts,
	// libellés en français avec les noms d'équipes, pour la feuille de correction.
	const selections: ValidationLineVM[] = base.map((s, i) => {
		const [home, away] = teamsOf(s.matchLabel);
		return {
			...s,
			analysable: flags[i],
			familleNonCouverte: s.raison === 'non_couvert' ? uncoveredFamily(s.texteBrut) : null,
			options: COVERED_MARKETS.map((m) => ({ market: m, label: marketLabelFr(m, home, away) }))
		};
	});
	const analysables = flags.filter(Boolean).length;
	return { selections, total: ticket.selections.length, analysables, cout: creditCost(analysables) };
};

export const actions: Actions = {
	// Résout une ligne ambiguë avec le marché choisi par l'utilisateur (jamais deviné).
	corriger: async ({ cookies, request }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
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
				// La cote transcrite valait pour le pari LU. L'utilisateur vient de changer
				// le pari : cette cote ne correspond plus au nouveau marché. On la retire —
				// afficher une cote qui ne colle plus au pari serait un mensonge (et couperait
				// la phrase de traduction pédagogique, qui n'a plus de cote fiable).
				coteSaisie: null,
				libelleFr: marketLabelFr(marche, home, away)
			};
		});
		await updateTicket(ticket.id, { selections });
		// Le serveur SEUL sait si le marché corrigé a une prédiction en base : on
		// renvoie le drapeau `analysable` pour que le client mette à jour son compteur
		// sans le deviner. Corriger le marché ne garantit pas qu'on l'analyse.
		const corrigee = selections.find((s) => s.ordre === ordre);
		const analysable = corrigee ? await analysableEnBase(corrigee) : false;
		// Appelée en arrière-plan (fetch) depuis un affichage déjà à jour : succès +
		// drapeau, aucune redirection (l'écran ne se recharge jamais).
		return { success: true, analysable };
	},

	// « Ce marché, on ne le couvre pas » : la ligne RESTE dans le ticket, marquée
	// non analysée, jamais facturée, jamais retirée du renforcé. C'est la sortie
	// honnête quand l'utilisateur a joué un marché hors de notre couverture — on
	// ne le force plus à déclarer un pari qu'il n'a pas fait.
	nonCouvert: async ({ cookies, request }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');

		const form = await request.formData();
		const ordre = Number(form.get('ordre'));
		const selections = ticket.selections.map((s) =>
			s.ordre === ordre
				? {
						...s,
						marche: null,
						etatResolution: 'inconnu' as const,
						raison: 'non_couvert' as const,
						candidates: undefined,
						probabilite: null,
						seuilFragile: null,
						libelleFr: ''
					}
				: s
		);
		await updateTicket(ticket.id, { selections });
		return { success: true };
	},

	// Retire une ligne non reconnue : elle sort du ticket, jamais facturée.
	retirer: async ({ cookies, request }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');

		const form = await request.formData();
		const ordre = Number(form.get('ordre'));
		const selections = ticket.selections.filter((s) => s.ordre !== ordre);
		await updateTicket(ticket.id, { selections });
		return { success: true };
	},

	// Valide la lecture : le ticket passe en « valide », direction le résultat.
	// On RE-COMBLE à la demande (même helper que le chargement) : la dédup (15 min)
	// fait que ce qui a déjà été demandé au chargement ne rappelle PAS le fournisseur
	// (phase=finaliser tombe à ~0 appel) ; ce qui restait (correction de dernière
	// seconde, ticket rouvert au-delà de 15 min) est comblé ici. /resultat LIT ensuite
	// (règle d'archi n°2). Budget DUR < 2 s ; échec → « pas encore de données ».
	finaliser: async ({ cookies }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');

		const { selections } = await comblerTicket(ticket.selections, nouveauBudget(), 'finaliser');
		await updateTicket(ticket.id, { selections, statut: 'valide' });
		redirect(303, '/resultat');
	}
};
