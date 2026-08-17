/**
 * services/writing — Rédaction de l'analyse (LLM). Le modèle reçoit un JSON de
 * chiffres et de faits DÉJÀ CALCULÉS et produit du texte français (brief §4.2).
 * Il ne calcule rien, ne sélectionne rien, ne juge rien, n'affirme aucune
 * causalité. La sortie passe par `guards.checkGeneratedText` (règles d'or n°1/2)
 * et `checkCausality` avant tout affichage.
 *
 * Le texte a DEUX niveaux (brief) :
 *   1. une SYNTHÈSE — une phrase sur le ticket entier ;
 *   2. une EXPLICATION par sélection retirée — deux à trois phrases courtes.
 */

/** Une sélection retirée du ticket renforcé, enrichie de faits descriptifs. */
export interface RetraitEnrichi {
	ordre: number;
	/** Libellé complet « Home – Away — Marché en français ». */
	libelleFr: string;
	/**
	 * Badge rouge visible (1X2, plus/moins 2,5, plus de 3,5) → ton « risqué » ;
	 * sans badge (double chance, plus de 1,5) → mention neutre « la moins solide »,
	 * jamais « fragile » (précision plus basse, on ne crie pas au loup).
	 */
	avecBadge: boolean;
	/** « une chance sur deux » — arrondi déterministe de 1/proba. null si non chiffrable. */
	chanceSurMot: string | null;
	/** Entier correspondant (2 pour « sur deux ») — autorisé au garde-fou des nombres. */
	chanceSur: number | null;
	/**
	 * Cote TRANSCRITE depuis la capture de l'utilisateur (exception documentée de la
	 * règle d'or n°1 : affichée, JAMAIS calculée). Sert uniquement à la phrase de
	 * traduction pédagogique (« une cote à 7,90… »). Le « une fois sur X » de cette
	 * phrase vient de `chanceSur` (notre probabilité), pas d'un calcul sur la cote.
	 * null si la cote n'a pas été lue → pas de phrase de traduction.
	 */
	cote: number | null;
	/**
	 * Faits descriptifs DÉJÀ rédigés (forme, buts, confrontations), en toutes
	 * lettres. Le rédacteur en choisit un ou deux et les reformule ; il n'en
	 * invente aucun (règle d'or n°1). Vide si rien de distinctif.
	 */
	faits: string[];
}

export interface WritingInput {
	/** Probabilités en forme d'affichage (pourcentage), ex. 1.3 et 7.5. */
	probaTotalePct: number;
	probaRenforceePct: number;
	nbRetirees: number;
	/** Nombre de sélections analysables du ticket (pour la synthèse). */
	nbMatchs: number;
	/** Nombre de sélections à badge rouge (pour la synthèse). */
	nbFragiles: number;
	/** Sélections retirées à expliquer (badge rouge ou mention neutre). */
	retraits: RetraitEnrichi[];
	rienARetirer: boolean;
	/**
	 * Rien retiré parce que TOUTES les sélections sont fragiles : alléger viderait le
	 * ticket. La synthèse ne doit PAS dire « tient debout » dans ce cas — on le dit.
	 */
	toutesFragiles?: boolean;
}

/** Sortie deux niveaux : une synthèse, puis une explication par sélection retirée. */
export interface AnalyseTexte {
	synthese: string;
	/** Une explication courte par sélection retirée (clé = ordre de la sélection). */
	parSelection: { ordre: number; texte: string }[];
}

export interface WritingService {
	/** JSON de chiffres et faits → texte français deux niveaux. Aucun nombre nouveau. */
	writeAnalysis(input: WritingInput): Promise<AnalyseTexte>;
	/**
	 * L'ensemble des nombres autorisés (forme d'affichage) déductible de l'entrée,
	 * à passer à `checkNumbers`. Centralisé pour rester synchrone avec le prompt.
	 */
	allowedNumbers(input: WritingInput): number[];
}

import { FakeWriting } from './fake';
import { AnthropicWriting, realWriterConfigured } from './anthropic';
import { guardFakeService } from '$lib/server/guardFake';

/**
 * ← Bascule vers le vrai modèle de rédaction.
 *
 * GARDE-FOU DE PRODUCTION : en production sans clé, le rédacteur factice est
 * refusé À L'USAGE (writeAnalysis lève) ; l'écran de résultat rattrape via son
 * repli template et le journalise (raison=echec_modele). On ne fait jamais
 * planter la page, mais on ne sert pas non plus un vrai texte inventé.
 */
function createWritingService(): WritingService {
	const real = realWriterConfigured();
	const impl = real ? new AnthropicWriting() : new FakeWriting();
	return guardFakeService('rédaction', real, impl);
}

export const writing: WritingService = createWritingService();
