/**
 * anthropic.ts — Vision réelle via un modèle Claude RAPIDE et BON MARCHÉ
 * (Haiku 4.5). C'est notre seule dépense vraiment variable : 1 à 3 appels par
 * ticket. Le modèle TRANSCRIT, il ne résout rien et ne calcule rien.
 *
 * Appel via `fetch` (pas de SDK) : le proxy sortant de l'environnement suffit,
 * et on garde la dépendance à zéro. La clé ne quitte jamais le serveur.
 */
import type { ImageInput, RawTicketRead, VisionService } from './index';
import { parseVisionResponse } from './parse';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // rapide + bon marché, vision solide
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const SYSTEM = `Tu transcris une capture d'écran de ticket de paris sportifs. Tu ne fais QUE lire.
Règles strictes :
- Tu ne résous pas les marchés ni les matchs, tu ne calcules rien, tu n'inventes rien.
- Tu renvoies UNIQUEMENT un objet JSON, sans aucun texte autour.
- Une entrée par sélection lue, dans l'ordre du ticket.
- Recopie les noms d'équipes et le marché EXACTEMENT comme écrits (pas de traduction, pas de normalisation).
Schéma :
{
  "estTicket": true,        // false si l'image n'est pas un ticket de paris (photo quelconque)
  "manuscrit": false,       // true si le ticket est écrit à la main (pas une capture d'application)
  "lisible": true,          // false si l'image est trop floue ou coupée pour être lue
  "lignes": [ { "match": "Équipe A - Équipe B", "marche": "marché tel qu'écrit", "cote": "1.85" } ],
  "coteTotale": "cote totale du ticket si visible, sinon chaîne vide"
}`;

export class AnthropicVision implements VisionService {
	constructor(private readonly key: string) {}

	async readTicket(images: ImageInput[]): Promise<RawTicketRead> {
		const usable = images.filter((i) => ALLOWED_MIME.has(i.mime) && i.data.length > 0).slice(0, 3);
		if (usable.length === 0) return { lignes: [], echec: 'illisible' };

		const content: unknown[] = usable.map((img) => ({
			type: 'image',
			source: { type: 'base64', media_type: img.mime, data: img.data }
		}));
		content.push({ type: 'text', text: 'Transcris ce ticket en JSON selon le schéma.' });

		let res: Response;
		try {
			res = await fetch(API, {
				method: 'POST',
				headers: {
					'x-api-key': this.key,
					'anthropic-version': '2023-06-01',
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					model: MODEL,
					max_tokens: 1024,
					system: SYSTEM,
					messages: [{ role: 'user', content }]
				})
			});
		} catch {
			return { lignes: [], echec: 'illisible' }; // réseau/API KO : jamais de facturation
		}

		if (!res.ok) return { lignes: [], echec: 'illisible' };
		const data = (await res.json().catch(() => null)) as { content?: Array<{ text?: string }> } | null;
		const text = data?.content?.[0]?.text;
		if (typeof text !== 'string') return { lignes: [], echec: 'illisible' };
		return parseVisionResponse(text);
	}
}
