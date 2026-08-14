/**
 * parse.ts — Transformation PURE de la réponse du modèle vision en lecture
 * normalisée. Aucun réseau, aucun état : testable sans clé ni appel. C'est ici
 * qu'on décide des échecs explicites (illisible / manuscrit / pas un ticket).
 */
import type { RawLine, RawTicketRead } from './index';

export interface VisionPayload {
	estTicket?: boolean;
	lisible?: boolean;
	manuscrit?: boolean;
	lignes?: Array<{ match?: string; marche?: string; cote?: string }>;
	coteTotale?: string;
}

/** Extrait le premier objet JSON d'une réponse (tolère ```json … ``` et le bavardage). */
export function extractJson(text: string): unknown | null {
	if (!text) return null;
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const body = fenced ? fenced[1] : text;
	const start = body.indexOf('{');
	const end = body.lastIndexOf('}');
	if (start === -1 || end === -1 || end <= start) return null;
	try {
		return JSON.parse(body.slice(start, end + 1));
	} catch {
		return null;
	}
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Réponse (déjà parsée en objet) → lecture normalisée, avec échecs explicites. */
export function toTicketRead(payload: unknown): RawTicketRead {
	if (!payload || typeof payload !== 'object') return { lignes: [], echec: 'illisible' };
	const p = payload as VisionPayload;

	if (p.estTicket === false) return { lignes: [], echec: 'pas_un_ticket' };
	if (p.manuscrit === true) return { lignes: [], echec: 'manuscrit' };

	const lignes: RawLine[] = (Array.isArray(p.lignes) ? p.lignes : [])
		.map((l): RawLine => {
			const matchText = clean(l?.match);
			const marketText = clean(l?.marche);
			const coteText = clean(l?.cote);
			const texteBrut = [matchText, marketText, coteText].filter(Boolean).join('  ');
			return { texteBrut, matchText, marketText, coteText };
		})
		.filter((l) => l.texteBrut.length > 0);

	if (p.lisible === false || lignes.length === 0) return { lignes: [], echec: 'illisible' };

	const read: RawTicketRead = { lignes };
	const totale = clean(p.coteTotale);
	if (totale) read.coteTotaleLue = totale;
	return read;
}

/** Texte brut du modèle → lecture normalisée (extraction JSON + normalisation). */
export function parseVisionResponse(text: string): RawTicketRead {
	return toTicketRead(extractJson(text));
}
