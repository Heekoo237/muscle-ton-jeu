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

const SYSTEM = `Tu LIS une capture d'écran de ticket de paris sportifs. Tu ne fais QUE lire — tu ne calcules rien, tu n'inventes rien, tu ne verses aucun chiffre de ton cru.
Tu renvoies UNIQUEMENT un objet JSON, sans aucun texte autour. Une entrée par sélection, dans l'ordre du ticket.

POUR CHAQUE SÉLECTION, DEUX CHOSES :

1) LE TEXTE, recopié EXACTEMENT comme écrit (pas de traduction, pas de normalisation) :
   - « match » : « Équipe A - Équipe B », noms tels quels.
   - « marche » : le pari choisi AVEC son issue, tel qu'affiché. Recopie l'issue MÊME si elle est
     à part du libellé (équipe surlignée, pastille « 1 »/« N »/« 2 », ligne au-dessus). Ex. :
     « Paris SG Résultat du match », « Nul 1 N 2 », « + de 2,5 buts ».
   - « cote » : la cote imprimée, telle quelle (ex. « 1.85 »).

2) LE CONCEPT, ce que TU COMPRENDS du pari, choisi dans une LISTE FERMÉE. C'est de la lecture,
   pas de la déduction : un pari « Nul » sur un marché « 1 N 2 » EST un match nul, quelle que
   soit la formulation (« Résultat du match », « Match Result », « 1X2 », « Full Time »…).

   « famille » — EXACTEMENT une de ces valeurs :
     RESULTAT_1X2   victoire d'une équipe ou match nul (1 / N / 2)
     DOUBLE_CHANCE  deux issues à la fois (équipe ou nul)
     PLUS_MOINS     nombre total de buts sur le MATCH ENTIER, plus ou moins d'un seuil
     BTTS           les deux équipes marquent (oui / non)
     NON_COUVERT    buteur, corners, cartons, tirs, score exact, handicap, ET TOUT marché
                    de PÉRIODE / MI-TEMPS (« 1ère mi-temps », « 1ère période », « 1st half »,
                    « HT », « 1T »/« 2T ») — même si c'est un total de buts de mi-temps.
     INCONNU        tu n'es pas sûr de ce qui est parié

   Selon la famille, ajoute le CHOIX — TOUJOURS relatif au match, JAMAIS positionnel.
   N'écris JAMAIS « domicile », « extérieur », « home », « away », « 1 », « 2 » : donne le NOM
   de l'équipe. C'est le code qui décidera du côté ; toi tu lis QUI est choisi.
     RESULTAT_1X2  → « choix » : le NOM de l'équipe gagnante, ou « NUL ».
     DOUBLE_CHANCE → « composantes » : les deux, noms d'équipe et/ou « NUL » (ex. ["FC Porto","NUL"]).
     PLUS_MOINS    → « direction » : « PLUS » ou « MOINS » ; « seuil » : le nombre lu.
                     Le seuil doit être lu TEL QUEL, jamais arrondi. Si le seuil affiché
                     n'est PAS exactement 1,5 / 2,5 / 3,5 (ex. 0,5, 1, 2, 4,5, une ligne
                     « (1) », un total de mi-temps) → famille NON_COUVERT, PAS PLUS_MOINS.
     BTTS          → « btts » : « OUI » ou « NON ».
     NON_COUVERT / INCONNU → pas d'autre champ.

   RÈGLE ABSOLUE : recopie ce qui est AFFICHÉ. Ne réécris pas, ne complète pas, n'arrondis
   pas un seuil, ne transforme jamais un pari de mi-temps en pari plein-match. Garde dans
   « marche » toute mention de période (« 1ère mi-temps », « 1T »…).
   Si tu ne peux pas lire l'issue avec certitude (surlignage absent, image coupée) : famille INCONNU.
   Ne devine jamais. Mieux vaut INCONNU qu'un pari inventé.

Schéma :
{
  "estTicket": true,        // false si l'image n'est pas un ticket de paris (photo quelconque)
  "manuscrit": false,       // true si le ticket est écrit à la main (pas une capture d'application)
  "lisible": true,          // false si l'image est trop floue ou coupée pour être lue
  "lignes": [
    { "match": "Rio Ave - FC Porto", "marche": "FC Porto 1 N 2 - 90 Mins", "cote": "1.32",
      "famille": "RESULTAT_1X2", "choix": "FC Porto" },
    { "match": "Alverca - CF Estrela", "marche": "Nul 1 N 2 - 90 Mins", "cote": "3.15",
      "famille": "RESULTAT_1X2", "choix": "NUL" },
    { "match": "Lyon - Rennes", "marche": "+ de 2,5 buts (t. rég)", "cote": "1.90",
      "famille": "PLUS_MOINS", "direction": "PLUS", "seuil": 2.5 },
    { "match": "Casa Pia - Benfica", "marche": "Benfica ou Nul Double chance", "cote": "1.05",
      "famille": "DOUBLE_CHANCE", "composantes": ["Benfica", "NUL"] },
    { "match": "Celtic - LASK", "marche": "1ère mi-temps, Total: (1) Plus de", "cote": "1.68",
      "famille": "NON_COUVERT" }
  ],
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
