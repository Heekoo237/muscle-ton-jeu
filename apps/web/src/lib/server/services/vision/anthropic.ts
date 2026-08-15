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
import { formatCostLine } from './cost';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // rapide + bon marché, vision solide
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// Garde-fou : une lecture qui traîne ne doit JAMAIS pendre jusqu'au 504 de la
// passerelle. Passé ce délai, on avorte → `readTicket` retombe sur son échec
// « illisible » (jamais de facturation) plutôt que de laisser la fonction expirer.
// La vision traite 1 à 3 images ; 25 s ne coupe jamais une lecture valide, il borne
// une panne. L'action /analyser peut relancer la lecture UNE fois (lecture
// incomplète) : 2 × 25 s = 50 s reste sous le `maxDuration` de 60 s de la route.
const TIMEOUT_MS = 25_000;

const SYSTEM = `Tu transcris une capture d'écran de ticket de paris sportifs. Tu ne fais QUE lire.
Règles strictes :
- Tu ne résous pas les marchés ni les matchs, tu ne calcules rien, tu n'inventes rien.
- Tu renvoies UNIQUEMENT un objet JSON, sans aucun texte autour.
- Une entrée par sélection lue, dans l'ordre du ticket.
- Recopie les noms d'équipes et le marché EXACTEMENT comme écrits (pas de traduction, pas de normalisation).
- Le « marché » d'une sélection, c'est le PARI CHOISI, issue COMPRISE : l'issue sélectionnée
  (l'équipe, « Nul », « + de 2,5 buts », « Oui/Non »…) AVEC son type de marché. Recopie
  l'issue MÊME si elle est affichée à part du libellé (équipe surlignée, pastille « 1 »/« N »/« 2 »,
  ligne au-dessus) : réunis-les dans « marche ». Ex. : « Paris SG Résultat du match »,
  « Nul Résultat du match », « FC Porto ». Un « Résultat du match » SANS issue est incomplet —
  cherche l'issue choisie sur la ligne (elle existe toujours, c'est ce qui a été parié).
Schéma :
{
  "estTicket": true,        // false si l'image n'est pas un ticket de paris (photo quelconque)
  "manuscrit": false,       // true si le ticket est écrit à la main (pas une capture d'application)
  "lisible": true,          // false si l'image est trop floue ou coupée pour être lue
  "lignes": [ { "match": "Équipe A - Équipe B", "marche": "pari choisi, issue COMPRISE (ex. « Paris SG Résultat du match »)", "cote": "1.85" } ],
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

		const ctrl = new AbortController();
		const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
				}),
				signal: ctrl.signal
			});
		} catch {
			return { lignes: [], echec: 'illisible' }; // réseau/API KO ou délai dépassé : jamais de facturation
		} finally {
			clearTimeout(minuteur);
		}

		if (!res.ok) return { lignes: [], echec: 'illisible' };
		const data = (await res.json().catch(() => null)) as {
			content?: Array<{ text?: string }>;
			usage?: Record<string, number>;
		} | null;
		// Coût réel de CETTE lecture (notre seule dépense variable) : on le mesure.
		if (data?.usage) console.log(formatCostLine(data.usage, usable.length));
		const text = data?.content?.[0]?.text;
		if (typeof text !== 'string') return { lignes: [], echec: 'illisible' };
		return parseVisionResponse(text);
	}
}
