/**
 * services/writing — Rédaction de l'analyse (LLM). Le modèle reçoit un JSON de
 * chiffres DÉJÀ CALCULÉS et produit du texte français (brief §4.2). Il ne
 * calcule rien, ne sélectionne rien, ne juge rien. La sortie passe ensuite par
 * `guards.checkGeneratedText` (règles d'or n°1 et n°2) avant tout affichage.
 */
export interface WritingInput {
	/** Probabilités en forme d'affichage (pourcentage), ex. 1.3 et 7.5. */
	probaTotalePct: number;
	probaRenforceePct: number;
	nbRetirees: number;
	/** Libellés français des sélections fragiles retirées. */
	fragiles: { libelleFr: string }[];
	confiance: 'faible' | 'correcte' | 'bonne';
	rienARetirer: boolean;
}

export interface WritingService {
	/** JSON de chiffres → texte français. Ne produit jamais un nombre nouveau. */
	writeAnalysis(input: WritingInput): Promise<string>;
	/**
	 * L'ensemble des nombres autorisés (forme d'affichage) déductible de l'entrée,
	 * à passer à `checkNumbers`. Centralisé ici pour rester synchrone avec le prompt.
	 */
	allowedNumbers(input: WritingInput): number[];
}

import { FakeWriting } from './fake';

/**
 * ← Point de bascule vers le vrai modèle de rédaction.
 *
 * GARDE-FOU OBLIGATOIRE À BRANCHER EN MÊME TEMPS QUE LE VRAI RÉDACTEUR : quand un
 * modèle réel existera, ajouter ici `assertRealInProduction('rédaction', realWriterConfigured())`
 * — comme sports/predictions/vision/paiement — pour qu'un déploiement en
 * production ne serve jamais le template plat à la place du vrai texte. Non
 * activé aujourd'hui : il n'existe pas encore de version réelle à exiger.
 */
function createWritingService(): WritingService {
	return new FakeWriting();
}

export const writing: WritingService = createWritingService();
