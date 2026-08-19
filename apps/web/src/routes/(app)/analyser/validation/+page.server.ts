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
	type PickCible
} from '$lib/server/odds/ondemand';
import type { Market, Selection } from '$lib/types';
import { COVERED_MARKETS } from '$lib/types';

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
	// Disponibilité de la probabilité vérifiée EN AMONT, en UNE requête pour tout le
	// ticket (avant : une lecture predictions PAR ligne = N+1, lent sur 3G). On lit le
	// lot, puis on tranche par ligne avec la règle UNIQUE `isAnalysable`.
	const fixtureIds = [
		...new Set(ticket.selections.map((s) => s.fixtureId).filter((x): x is number => x !== null))
	];
	const preds = await predictions.forFixtures(fixtureIds);
	const flags = ticket.selections.map((s) => {
		if (s.fixtureId === null || s.marche === null) return false;
		const p = (preds.get(s.fixtureId) ?? []).find((pr) => pr.marche === s.marche) ?? null;
		return isAnalysable({ ...s, probabilite: p?.probabilite ?? null });
	});
	// Chaque ligne est corrigeable : on précalcule tous les marchés couverts,
	// libellés en français avec les noms d'équipes, pour la feuille de correction.
	const selections: ValidationLineVM[] = ticket.selections.map((s, i) => {
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
	// AVANT de valider (chemin d'ÉCRITURE), on comble à la demande les cotes
	// manquantes : une ligne résolue mais sans probabilité déclenche un appel
	// The Odds API pour son championnat, un dévigeage déterministe et une écriture
	// dans `predictions`. /resultat LIT ensuite normalement (règle d'archi n°2). La
	// récupération ne lève jamais et est bornée < 2 s ; en cas d'échec on retombe
	// simplement sur « pas encore de données ».
	finaliser: async ({ cookies }) => {
		const id = cookies.get('ticketId');
		const ticket = id ? await getTicket(id) : undefined;
		if (!ticket) redirect(303, '/analyser');

		// UN SEUL budget de temps DUR partagé par les deux passes (cotes manquantes +
		// matchs non résolus) : le total reste < 2 s même si les deux tournent.
		const budget = nouveauBudget();

		// Ciblage PAR MARCHÉ JOUÉ : on ne comble que le pari réellement posé (« Boca
		// gagne » ne va pas chercher les plus/moins). Une ligne résolue = (fixture, marché).
		const picks: PickCible[] = ticket.selections
			.filter((s) => s.fixtureId !== null && s.marche !== null)
			.map((s) => ({ fixtureId: s.fixtureId as number, marche: s.marche as Market }));
		const journal = await remplirCotesManquantes(picks, budget);

		// Les matchs INTERROGÉS mais que le fournisseur ne price pas portent le message
		// honnête « pas encore coté » (distinct du transitoire « pas encore de données »).
		let selections =
			journal.nonCotes.size > 0
				? ticket.selections.map((s) =>
						s.fixtureId !== null && journal.nonCotes.has(s.fixtureId)
							? { ...s, raison: 'non_cote' as const }
							: s
					)
				: ticket.selections;

		// Lignes NON RÉSOLUES (match pas encore en base) : si les deux équipes sont
		// reconnues et partagent une ligue du catalogue, on interroge la ligue en
		// direct — le match peut avoir été listé depuis la dernière collecte (trou de
		// fraîcheur). Trouvé → on crée le fixture et on re-résout ; absent → « pas
		// encore coté ». Même budget partagé, jamais bloquant.
		if (selections.some((s) => s.raison === 'non_resolu' && s.fixtureId === null)) {
			const [fixtures, teams] = await Promise.all([sports.resolutionFixtures(), sports.teams()]);
			selections = (await remplirMatchsNonResolus(selections, teams, fixtures, budget)).selections;
		}

		await updateTicket(ticket.id, { selections, statut: 'valide' });
		redirect(303, '/resultat');
	}
};
