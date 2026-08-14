/**
 * services/vision — Lecture de la capture (LLM vision). Le modèle EXTRAIT du
 * texte, il ne résout ni les matchs ni les marchés (brief §4.1). Sortie = JSON
 * brut, une entrée par ligne lue. AUCUN nombre de ce service n'est une proba :
 * la seule valeur numérique transcrite est la COTE imprimée sur le ticket (ce que
 * l'utilisateur a joué), affichée pour qu'il vérifie qu'on a bien lu — jamais
 * une probabilité calculée (CLAUDE.md, règle d'or n°1).
 */
export interface RawLine {
	/** Ligne telle quelle (repli d'affichage et de découpe). */
	texteBrut: string;
	/** Champs structurés quand le modèle les isole (résolution plus robuste). */
	matchText?: string;
	marketText?: string;
	coteText?: string;
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
import { assertRealInProduction } from '$lib/server/guardFake';

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
	assertRealInProduction('vision (lecture des captures)', Boolean(key));
	return key ? new AnthropicVision(key) : new FakeVision();
}

export const vision: VisionService = createVisionService();
