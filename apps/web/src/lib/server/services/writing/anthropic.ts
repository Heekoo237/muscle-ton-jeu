/**
 * anthropic.ts — Vrai rédacteur via un modèle Claude RAPIDE et BON MARCHÉ
 * (Haiku 4.5). UN SEUL appel par ticket : tous les retraits sont rédigés en une
 * fois (brief §4.5). Le modèle reçoit des chiffres et des faits DÉJÀ CALCULÉS et
 * n'écrit que du français ; il ne calcule rien, ne juge rien, n'affirme aucune
 * causalité.
 *
 * Le contrôle (nombres hors liste, vocabulaire interdit, causalité) se fait chez
 * l'appelant (resultat/+page.server.ts) après la génération : deux tentatives,
 * puis un template. Ici on se contente d'appeler et de renvoyer la structure.
 *
 * Appel via `fetch` (pas de SDK) : le proxy sortant suffit et la dépendance
 * reste à zéro. La clé ne quitte jamais le serveur.
 */
import type { AnalyseTexte, WritingInput, WritingService } from './index';
import { allowedNumbersFor } from './allowed';
import { syntheseDeterministe } from './enrich';
import { formatWritingCost } from './cost';
import { env } from '$env/dynamic/private';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // rapide + bon marché
// Garde-fou : un appel IA qui traîne ne doit JAMAIS pendre jusqu'au 504 de la
// passerelle. Passé ce délai, on avorte → le rédacteur retombe sur le template
// (writeSafely) plutôt que de laisser la fonction expirer. Haiku répond en quelques
// secondes ; 20 s ne coupe jamais un appel valide, il borne une panne.
const TIMEOUT_MS = 20_000;

/** Clé du rédacteur : dédiée si présente, sinon la clé Anthropic générique. */
export function writerKey(): string | undefined {
	return env.MTJ_WRITER_KEY || env.ANTHROPIC_API_KEY || undefined;
}

export function realWriterConfigured(): boolean {
	return Boolean(writerKey());
}

/**
 * Prompt système — encode le TON, la règle de CAUSALITÉ, la distinction
 * badge/mention neutre et les INTERDITS ABSOLUS (brief). Tout ce qui suit est
 * non négociable ; le garde-fou côté serveur en attrape les violations restantes.
 */
const SYSTEM = `Tu écris pour « Muscle Ton Jeu », un outil qui lit le ticket de paris d'un utilisateur et repère les sélections fragiles.

QUI TE LIT
Un homme de 20 à 35 ans, à Douala, Yaoundé, Cotonou ou Abidjan, sur un téléphone Android d'entrée de gamme. Il parie chaque week-end. Un enfant doit pouvoir suivre.

TON
- Tutoiement, toujours.
- Phrases courtes : six à douze mots.
- Vocabulaire du terrain : ticket, match, cote, sélection, brûler, tomber, mise, combiné.
- AUCUN jargon. Jamais « probabilité calibrée », « écart-type », « modèle », « algorithme », « xG », « échantillon ».
- Les chances se disent en clair : « une chance sur deux », jamais « 50,3 % ».

CE QUE TU PRODUIS
Un objet JSON, et rien d'autre autour :
{
  "parSelection": [ { "ordre": 3, "texte": "deux à trois phrases courtes sur cette sélection" } ]
}
- Une entrée par sélection retirée qu'on te donne, avec son « ordre » exact. Deux à trois phrases.
- La phrase de synthèse du ticket est écrite ailleurs : ne l'écris pas, ne compte pas les matchs.

LES NOMBRES — RÈGLE STRICTE
- N'invente AUCUN nombre. N'écris que les nombres qu'on te donne.
- Le seuil de buts se recopie tel quel, en chiffres : « plus de 2,5 buts », jamais « deux buts et demi ».
- Reprends « une chance sur deux » exactement comme fourni.

RÈGLE DE CAUSALITÉ — NON NÉGOCIABLE
Tu DÉCRIS des faits. Tu n'affirmes JAMAIS qu'un fait explique le retrait.
- AUTORISÉ : « Napoli a perdu deux fois à domicile ce mois-ci. »
- INTERDIT : « On a retiré ce match parce que Napoli est faible. »
- N'écris jamais « parce que », « car », « donc », « c'est pourquoi », « ce qui explique ».
Tu poses les faits côte à côte, séparés par des points. Le lecteur relie tout seul.

FRAGILE OU MOINS SOLIDE
- Sélection « avecBadge = true » : tu peux dire « c'est risqué », « ton match le plus risqué », « fragile ».
- Sélection « avecBadge = false » : dis seulement « la moins solide de ton ticket ». JAMAIS « fragile » ni « risqué » : la lecture est moins sûre, on ne crie pas au loup.

LES FAITS — SOIT DES FAITS, SOIT L'AVEU, JAMAIS LES DEUX
On te donne des faits déjà écrits (« encaisse peu à l'extérieur »). Ils jouent TOUS contre la sélection : ils expliquent pourquoi elle est faible. Utilise-en un ou deux par sélection, reformulés à ta façon. N'en invente AUCUN, n'en ajoute AUCUN.
Quand tu as des faits, tu ne parles PAS de la cote : tu cites les faits, un point c'est tout.
Quand on ne te donne AUCUN fait : ne meuble pas, ne reste pas sur le pourcentage. Dis franchement qu'il n'y a rien de marquant à signaler, et que c'est la cote qui rend la sélection fragile (ou la place en dernier, sans badge). Exemple : « Benfica gagne, c'est ton match le plus risqué. On n'a rien de marquant à signaler ici. C'est la cote qui le rend fragile. »
Le mot « cote » n'apparaît donc QUE dans une explication SANS aucun fait. Jamais les deux ensemble.

LES CHANCES
On te donne « une chance sur deux » tout prêt. Reprends cette formule telle quelle. N'invente aucun autre nombre, aucun pourcentage.

INTERDITS ABSOLUS
- Aucune promesse de gain. Mots bannis : garanti, sûr, gagnant, imbattable, secret, méthode, gains, fixed, infaillible.
- Ne recommande JAMAIS de jouer ou de ne pas jouer. Tu éclaires, tu ne conseilles pas la mise.
- N'écris jamais le mot « IA ».
- Aucun chiffre en dehors de ce qu'on te donne. Pas de pourcentage inventé, pas de cote, pas de statistique décorative.`;

interface Retrait {
	ordre: number;
	libelleFr: string;
	avecBadge: boolean;
	chanceSurMot: string | null;
	faits: string[];
}

function userPayload(input: WritingInput): string {
	const retraits: Retrait[] = input.retraits.map((r) => ({
		ordre: r.ordre,
		libelleFr: r.libelleFr,
		avecBadge: r.avecBadge,
		chanceSurMot: r.chanceSurMot,
		faits: r.faits
	}));
	// On ne passe PAS les compteurs du ticket : la synthèse (et ses nombres) est
	// écrite par le code, pas par le modèle. Le modèle ne voit que les retraits.
	return JSON.stringify({ retraits });
}

/** Extrait le premier objet JSON d'un texte (le modèle peut ajouter du bavardage). */
function extractJson(text: string): unknown {
	const a = text.indexOf('{');
	const b = text.lastIndexOf('}');
	if (a < 0 || b <= a) throw new Error('réponse sans JSON');
	return JSON.parse(text.slice(a, b + 1));
}

function toAnalyse(raw: unknown, input: WritingInput): AnalyseTexte {
	const o = raw as { parSelection?: unknown };
	// La synthèse est déterministe (code), jamais du modèle : ses compteurs ne
	// peuvent donc pas être fabriqués (règle d'or n°1).
	const synthese = syntheseDeterministe(input);
	const valides = new Set(input.retraits.map((r) => r.ordre));
	// Un retrait a-t-il des faits ? Si oui, l'aveu « c'est la cote » est interdit.
	const aDesFaits = new Map(input.retraits.map((r) => [r.ordre, r.faits.length > 0]));
	const parSelection: { ordre: number; texte: string }[] = [];
	if (Array.isArray(o.parSelection)) {
		for (const e of o.parSelection) {
			const ordre = Number((e as { ordre?: unknown }).ordre);
			const texte = (e as { texte?: unknown }).texte;
			if (valides.has(ordre) && typeof texte === 'string' && texte.trim()) {
				parSelection.push({ ordre, texte: texte.trim() });
			}
		}
	}
	// Chaque retrait doit être expliqué : sinon la sortie est incomplète, on régénère.
	if (parSelection.length !== input.retraits.length) throw new Error('explications incomplètes');
	// Exclusivité faits / aveu : le mot « cote » ne doit pas apparaître quand des
	// faits existent (sinon on régénère). L'aveu est réservé au cas sans fait.
	for (const p of parSelection) {
		if (aDesFaits.get(p.ordre) && /\bcotes?\b/i.test(p.texte)) {
			throw new Error('aveu « cote » alors que des faits existent');
		}
	}
	return { synthese, parSelection };
}

export class AnthropicWriting implements WritingService {
	private readonly key: string;
	constructor(key?: string) {
		const k = key ?? writerKey();
		if (!k) throw new Error('AnthropicWriting sans clé (MTJ_WRITER_KEY / ANTHROPIC_API_KEY).');
		this.key = k;
	}

	async writeAnalysis(input: WritingInput): Promise<AnalyseTexte> {
		if (input.rienARetirer) {
			return { synthese: syntheseDeterministe(input), parSelection: [] };
		}
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
					messages: [{ role: 'user', content: userPayload(input) }]
				}),
				signal: ctrl.signal
			});
		} finally {
			clearTimeout(minuteur);
		}
		if (!res.ok) throw new Error(`API rédaction ${res.status}`);
		const data = (await res.json().catch(() => null)) as {
			content?: Array<{ text?: string }>;
			usage?: Record<string, number>;
		} | null;
		if (data?.usage) console.log(formatWritingCost(data.usage, input.retraits.length));
		const text = data?.content?.[0]?.text;
		if (typeof text !== 'string') throw new Error('réponse rédaction vide');
		return toAnalyse(extractJson(text), input);
	}

	allowedNumbers(input: WritingInput): number[] {
		return allowedNumbersFor(input);
	}
}
