/**
 * allowed.ts — L'ensemble des nombres AUTORISÉS dans le texte rédigé, en forme
 * d'affichage. Centralisé ici pour que le rédacteur factice ET le vrai modèle
 * partagent EXACTEMENT la même liste que le garde-fou `checkNumbers`.
 *
 * Ce qui est autorisé, et RIEN d'autre :
 *   - les pourcentages calculés : proba totale, proba renforcée ;
 *   - les compteurs du ticket : retirées, matchs analysables, fragiles ;
 *   - « une chance sur X » : l'entier X de chaque retrait (arrondi de 1/proba) ;
 *   - les seuls seuils de marché des libellés (1,5 · 2,5 · 3,5).
 *
 * Jeu élargi au STRICT NÉCESSAIRE. On ne prend PAS les autres nombres d'un
 * libellé (numéro dans un nom d'équipe : « Mainz 05 » → 05) — le garde-fou
 * masque d'abord les noms propres. Les faits descriptifs sont écrits en toutes
 * lettres (« deux », « trois »), donc n'ajoutent aucun nombre à autoriser.
 */
import { extractNumbers, extractNumberWords } from '$lib/server/domain/guards';
import type { WritingInput } from './index';

/** Les seuls seuils de marché du système (plus/moins de buts). */
const SEUILS_MARCHES = new Set([1.5, 2.5, 3.5]);

export function allowedNumbersFor(input: WritingInput): number[] {
	const base = [
		input.probaTotalePct,
		input.probaRenforceePct,
		input.nbRetirees,
		input.nbMatchs,
		input.nbFragiles
	];
	const chances = input.retraits
		.map((r) => r.chanceSur)
		.filter((x): x is number => typeof x === 'number');
	// La COTE transcrite (exception documentée règle d'or n°1) est autorisée dans le
	// texte : c'est le seul nombre lu, jamais calculé. Sans ça, la phrase de traduction
	// « une cote à 7,90 » serait rejetée par le garde-fou.
	const cotes = input.retraits
		.map((r) => r.cote)
		.filter((x): x is number => typeof x === 'number');
	const seuils = input.retraits
		.flatMap((r) => extractNumbers(r.libelleFr))
		.filter((n) => SEUILS_MARCHES.has(n));
	// Les nombres DÉJÀ présents dans les faits fournis (« perdu deux fois », « cinq
	// derniers matchs ») sont des valeurs calculées, donc autorisées : sinon le
	// garde-fou des nombres en toutes lettres rejetterait un fait légitime.
	const faits = input.retraits.flatMap((r) =>
		r.faits.flatMap((f) => [...extractNumbers(f), ...extractNumberWords(f)])
	);
	return [...base, ...chances, ...cotes, ...seuils, ...faits];
}
