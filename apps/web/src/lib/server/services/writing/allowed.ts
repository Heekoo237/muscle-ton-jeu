/**
 * allowed.ts — L'ensemble des nombres AUTORISÉS dans le texte rédigé, en forme
 * d'affichage. Centralisé ici pour que le rédacteur factice ET le vrai modèle
 * partagent EXACTEMENT la même liste que le garde-fou `checkNumbers`.
 *
 * Base : les pourcentages et compteurs calculés (proba totale/renforcée, retirées).
 * Plus : les SEULS seuils de marché présents dans les libellés des fragiles
 * (1,5 · 2,5 · 3,5), pour que « Plus de 2,5 buts » passe le contrôle.
 *
 * Jeu élargi au STRICT NÉCESSAIRE. On ne prend PAS les autres nombres d'un
 * libellé (numéro dans un nom d'équipe : « Mainz 05 » → 05) : un jeu trop large
 * annulerait la protection. Ces cas rares basculent sur le template ; le journal
 * de bascule (resultat/+page.server.ts) les rend visibles si ça compte.
 */
import { extractNumbers } from '$lib/server/domain/guards';
import type { WritingInput } from './index';

/** Les seuls seuils de marché du système (plus/moins de buts). */
const SEUILS_MARCHES = new Set([1.5, 2.5, 3.5]);

export function allowedNumbersFor(input: WritingInput): number[] {
	const base = [input.probaTotalePct, input.probaRenforceePct, input.nbRetirees];
	const seuils = input.fragiles
		.flatMap((f) => extractNumbers(f.libelleFr))
		.filter((n) => SEUILS_MARCHES.has(n));
	return [...base, ...seuils];
}
