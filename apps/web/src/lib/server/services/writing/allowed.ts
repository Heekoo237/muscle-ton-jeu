/**
 * allowed.ts — L'ensemble des nombres AUTORISÉS dans le texte rédigé, en forme
 * d'affichage. Centralisé ici pour que le rédacteur factice ET le vrai modèle
 * partagent EXACTEMENT la même liste que le garde-fou `checkNumbers`.
 *
 * Base : les pourcentages et compteurs calculés (proba totale/renforcée, retirées).
 * Plus : tous les nombres présents dans NOS libellés de fragiles — seuils de
 * marché (« Plus de 2,5 buts » → 2,5) et nombres de noms d'équipe (« Mainz 05 »
 * → 05). Ce sont nos libellés, pas des chiffres fabriqués : le rédacteur doit
 * pouvoir nommer la sélection. Sans ça, un fragile plus/moins faisait échouer le
 * contrôle et dégradait le texte en template.
 */
import { extractNumbers } from '$lib/server/domain/guards';
import type { WritingInput } from './index';

export function allowedNumbersFor(input: WritingInput): number[] {
	const base = [input.probaTotalePct, input.probaRenforceePct, input.nbRetirees];
	const fromLabels = input.fragiles.flatMap((f) => extractNumbers(f.libelleFr));
	return [...base, ...fromLabels];
}
