/**
 * services/vision — Lecture de la capture (LLM vision). Le modèle EXTRAIT du
 * texte, il ne résout ni les matchs ni les marchés (brief §4.1). Sortie = JSON
 * brut, une entrée par ligne lue. Aucun nombre de ce service n'est une proba.
 */
export interface RawLine {
	texteBrut: string;
}

export interface RawTicketRead {
	lignes: RawLine[];
	/** Cote totale lue sur le ticket, telle quelle (chaîne), si visible. */
	coteTotaleLue?: string;
}

export interface ImageInput {
	/** Données de l'image (base64 ou URL de stockage). */
	data: string;
	mime: string;
}

export interface VisionService {
	/** 1 à 3 captures → texte brut ligne par ligne. */
	readTicket(images: ImageInput[]): Promise<RawTicketRead>;
}

import { FakeVision } from './fake';

/** ← Point de bascule vers le vrai modèle vision bon marché (Session 8). */
function createVisionService(): VisionService {
	return new FakeVision();
}

export const vision: VisionService = createVisionService();
