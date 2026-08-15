/**
 * parse.ts — Transformation PURE de la réponse du modèle vision en lecture
 * normalisée. Aucun réseau, aucun état : testable sans clé ni appel. C'est ici
 * qu'on décide des échecs explicites (illisible / manuscrit / pas un ticket).
 */
import type { MarketConcept, MarketFamily, RawLine, RawTicketRead } from './index';

interface RawConcept {
	famille?: unknown;
	choix?: unknown;
	composantes?: unknown;
	direction?: unknown;
	seuil?: unknown;
	btts?: unknown;
}

export interface VisionPayload {
	estTicket?: boolean;
	lisible?: boolean;
	manuscrit?: boolean;
	lignes?: Array<{
		match?: string;
		marche?: string;
		cote?: string;
		famille?: unknown;
		choix?: unknown;
		composantes?: unknown;
		direction?: unknown;
		seuil?: unknown;
		btts?: unknown;
	}>;
	coteTotale?: string;
}

const FAMILLES: ReadonlySet<string> = new Set<MarketFamily>([
	'RESULTAT_1X2',
	'DOUBLE_CHANCE',
	'PLUS_MOINS',
	'BTTS',
	'NON_COUVERT',
	'INCONNU'
]);

/**
 * Concept lu → concept validé, ou `undefined` si la famille est absente/inconnue
 * (on retombe alors sur le texte, jamais deviné). On NE fait ici AUCUNE résolution
 * de côté : le choix reste un nom d'équipe / « NUL », le seuil un nombre brut. Le
 * redressement (côté, contrainte du seuil, recoupement) est le travail du code de
 * résolution (resolve.ts), avec le fixture en main.
 */
function toConcept(raw: RawConcept | undefined): MarketConcept | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const famille = typeof raw.famille === 'string' ? raw.famille.trim().toUpperCase() : '';
	if (!FAMILLES.has(famille)) return undefined; // famille absente/exotique → secours texte
	const c: MarketConcept = { famille: famille as MarketFamily };
	if (typeof raw.choix === 'string' && raw.choix.trim()) c.choix = raw.choix.trim();
	if (Array.isArray(raw.composantes)) {
		const parts = raw.composantes.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
		if (parts.length) c.composantes = parts.map((s) => s.trim());
	}
	const dir = typeof raw.direction === 'string' ? raw.direction.trim().toUpperCase() : '';
	if (dir === 'PLUS' || dir === 'MOINS') c.direction = dir;
	if (typeof raw.seuil === 'number' && Number.isFinite(raw.seuil)) c.seuil = raw.seuil;
	else if (typeof raw.seuil === 'string') {
		const n = Number(raw.seuil.replace(',', '.'));
		if (Number.isFinite(n)) c.seuil = n;
	}
	const btts = typeof raw.btts === 'string' ? raw.btts.trim().toUpperCase() : '';
	if (btts === 'OUI' || btts === 'NON') c.btts = btts;
	return c;
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
			const concept = toConcept(l);
			const line: RawLine = { texteBrut, matchText, marketText, coteText };
			if (concept) line.concept = concept;
			return line;
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
