/**
 * services/vision — Lecture de la capture (LLM vision). Le modèle EXTRAIT du
 * texte, il ne résout ni les matchs ni les marchés (brief §4.1). Sortie = JSON
 * brut, une entrée par ligne lue. AUCUN nombre de ce service n'est une proba :
 * la seule valeur numérique transcrite est la COTE imprimée sur le ticket (ce que
 * l'utilisateur a joué), affichée pour qu'il vérifie qu'on a bien lu — jamais
 * une probabilité calculée (CLAUDE.md, règle d'or n°1).
 */
/**
 * FAMILLE de marché — liste FERMÉE lue par le modèle vision (son droit n°1 : lire
 * un concept, pas une chaîne). Le CODE vérifie ensuite qu'elle est dans cette
 * liste et redresse le CÔTÉ depuis la donnée (jamais depuis l'ordre d'affichage).
 * `NON_COUVERT` : buteur, corners, cartons, mi-temps… `INCONNU` : le modèle n'est
 * pas sûr. Ni l'un ni l'autre n'est jamais deviné (règle d'archi n°3).
 */
export type MarketFamily =
	| 'RESULTAT_1X2'
	| 'DOUBLE_CHANCE'
	| 'PLUS_MOINS'
	| 'BTTS'
	| 'NON_COUVERT'
	| 'INCONNU';

/**
 * Le CONCEPT lu par la vision — jamais positionnel. Le choix est le nom d'équipe
 * ou « NUL », JAMAIS « domicile/extérieur » : c'est le code, avec le fixture
 * résolu, qui décide du côté (règle d'or n°1 : un côté déduit de l'ordre du
 * bookmaker serait un chiffre faux, plausible, invisible). AUCUN nombre du modèle
 * n'est une proba ; le seuil lu est recoupé contre le texte, jamais utilisé seul.
 */
export interface MarketConcept {
	famille: MarketFamily;
	/** RESULTAT_1X2 : nom d'équipe lu tel quel, ou « NUL ». */
	choix?: string;
	/** DOUBLE_CHANCE : les deux composantes (noms d'équipe et/ou « NUL »). */
	composantes?: string[];
	/** PLUS_MOINS : sens du pari. */
	direction?: 'PLUS' | 'MOINS';
	/** PLUS_MOINS : seuil lu (attendu 1.5 / 2.5 / 3.5, contraint et recoupé côté code). */
	seuil?: number;
	/** BTTS : les deux équipes marquent, oui ou non. */
	btts?: 'OUI' | 'NON';
}

export interface RawLine {
	/** Ligne telle quelle (repli d'affichage et de découpe). */
	texteBrut: string;
	/** Champs structurés quand le modèle les isole (résolution plus robuste). */
	matchText?: string;
	marketText?: string;
	coteText?: string;
	/**
	 * Concept lu dans la liste fermée. Quand il est présent ET résout avec
	 * certitude, il PRIME sur l'analyse de chaîne. Sinon (absent, ou INCONNU), le
	 * code retombe sur la table/heuristiques de `marketText` — jamais deviné.
	 */
	concept?: MarketConcept;
}

/** Raison d'un échec de lecture — jamais silencieux, jamais facturé. */
export type VisionEchec = 'illisible' | 'manuscrit' | 'pas_un_ticket' | 'pas_une_image';

export interface RawTicketRead {
	lignes: RawLine[];
	/** Cote totale lue sur le ticket, telle quelle (chaîne), si visible. */
	coteTotaleLue?: string;
	/** Renseigné si la lecture a échoué : aucune ligne exploitable, pas de facturation. */
	echec?: VisionEchec;
}

export interface ImageInput {
	/** Données de l'image en base64 (sans préfixe data:). */
	data: string;
	mime: string;
}

export interface VisionService {
	/** 1 à 3 captures → texte brut ligne par ligne (ou un échec explicite). */
	readTicket(images: ImageInput[]): Promise<RawTicketRead>;
}

import { env } from '$env/dynamic/private';
import { FakeVision } from './fake';
import { AnthropicVision } from './anthropic';
import { guardFakeService } from '$lib/server/guardFake';

/** Clé du modèle vision : dédiée si présente, sinon la clé Anthropic générique. */
export function visionKey(): string | undefined {
	return env.MTJ_VISION_KEY || env.ANTHROPIC_API_KEY || undefined;
}

/**
 * Point de bascule unique. Avec une clé, on lit vraiment la capture ; sans clé,
 * le ticket factice permet de dérouler le reste du parcours en local. En
 * production, le factice est REFUSÉ : on ne sert jamais l'analyse d'un ticket
 * de démonstration à la place de la vraie capture de l'utilisateur.
 */
function createVisionService(): VisionService {
	const key = visionKey();
	const impl = key ? new AnthropicVision(key) : new FakeVision();
	// Refus À L'USAGE en production (jamais à l'import) : sans clé, lire une
	// capture lève une erreur claire, que l'action /analyser rend lisible.
	return guardFakeService('vision (lecture des captures)', Boolean(key), impl);
}

export const vision: VisionService = createVisionService();
