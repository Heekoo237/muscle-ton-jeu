/**
 * guards.ts — Les règles d'or rendues exécutables.
 *
 * Règle d'or n°1 (CLAUDE.md) : aucun nombre affiché ne sort d'un LLM.
 *   → `checkNumbers` extrait tous les nombres du texte produit et vérifie que
 *     chacun figure dans l'ensemble des nombres déjà calculés (le JSON d'entrée).
 *
 * Règle d'or n°2 (CLAUDE.md) : aucune promesse de gain, aucun vocabulaire interdit.
 *   → `checkVocabulary` refuse les termes interdits et « précision » employé seul.
 *
 * Ces fonctions ne rédigent rien : elles jugent un texte déjà produit et
 * déclenchent la régénération (brief §4.3). Après 2 échecs, l'appelant affiche
 * une version template sans chiffres.
 */

/* ------------------------------------------------------------------------ */
/*  VOCABULAIRE INTERDIT (règle d'or n°2)                                    */
/* ------------------------------------------------------------------------ */

/** Frontière de mot compatible avec les lettres accentuées (\b est ASCII). */
const L = '\\p{L}';
function word(core: string): RegExp {
	return new RegExp(`(?<![${L}])(?:${core})(?![${L}])`, 'iu');
}

/**
 * Termes interdits partout dans un texte affiché. La liste vient mot pour mot
 * du CLAUDE.md (« garanti · sûr · gagnant · imbattable · secret · méthode ·
 * gains · fixed · infaillible ») augmentée des flexions courantes.
 *
 * Note « sûr » : l'accent est exigé pour ne pas heurter la préposition « sur ».
 */
const FORBIDDEN: { label: string; re: RegExp }[] = [
	{ label: 'garanti', re: word('garanti\\w*') },
	{ label: 'sûr', re: word('sûr(?:e|s|es)?') },
	{ label: 'gagnant', re: word('gagnant(?:e|s|es)?') },
	{ label: 'imbattable', re: word('imbattables?') },
	{ label: 'secret', re: word('secr[eè]te?s?') },
	{ label: 'méthode', re: word('méthodes?') },
	{ label: 'gains', re: word('gains?') },
	{ label: 'fixed', re: word('fixed') },
	{ label: 'infaillible', re: word('infaillibles?') }
];

/** « précision » n'apparaît jamais seul : toléré uniquement si « rendement » co-existe. */
const RE_PRECISION = word('précisions?');
const RE_RENDEMENT = word('rendements?');

export interface VocabularyResult {
	ok: boolean;
	/** Étiquettes des termes interdits rencontrés. */
	hits: string[];
}

export function checkVocabulary(text: string): VocabularyResult {
	const hits: string[] = [];
	for (const { label, re } of FORBIDDEN) {
		if (re.test(text)) hits.push(label);
	}
	if (RE_PRECISION.test(text) && !RE_RENDEMENT.test(text)) {
		hits.push('précision (employé seul)');
	}
	return { ok: hits.length === 0, hits };
}

/* ------------------------------------------------------------------------ */
/*  NOMBRES DANS LE TEXTE (règle d'or n°1)                                   */
/* ------------------------------------------------------------------------ */

const NBSP = ' '; // espace insécable
const NNBSP = ' '; // espace fine insécable
const THOUSANDS = new RegExp(`[ ${NBSP}${NNBSP}]`, 'g');

/**
 * Extrait tous les nombres d'un texte, format français inclus :
 *   « 7,5 % » → 7.5   ·   « 1 000 » → 1000   ·   « 3 matchs » → 3
 * Gère l'espace insécable (U+00A0) et l'espace fine insécable (U+202F) comme
 * séparateurs de milliers, et la virgule décimale française.
 */
export function extractNumbers(text: string): number[] {
	const RE = new RegExp(`\\d[\\d ${NBSP}${NNBSP}.,]*\\d|\\d`, 'g');
	const out: number[] = [];
	for (const m of text.matchAll(RE)) {
		// Retirer les séparateurs de milliers, garder la virgule décimale.
		const cleaned = m[0].replace(THOUSANDS, '');
		// Format français : la virgule est décimale ; un point résiduel est un
		// séparateur de milliers → on le retire, puis on convertit la virgule.
		const normalized = cleaned.replace(/\./g, '').replace(',', '.');
		const value = Number(normalized);
		if (!Number.isNaN(value)) out.push(value);
	}
	return out;
}

export interface NumbersResult {
	ok: boolean;
	/** Nombres présents dans le texte mais absents des valeurs autorisées. */
	offending: number[];
}

/** Échappe les caractères spéciaux d'une chaîne pour un usage littéral en regex. */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Retire du texte les NOMS PROPRES fournis (noms d'équipe, libellés de match)
 * avant l'extraction des nombres. Un numéro dans un nom propre (« Mainz 05 ») est
 * un morceau de nom, pas un chiffre analytique : on le sort de l'analyse plutôt
 * que d'élargir la liste blanche (ce qui créerait un trou). Ce qui reste — « 2,5 »,
 * « 7,5 % », ou un « 87 % » inventé — est vérifié normalement.
 */
function stripNames(text: string, names: string[]): string {
	let out = text;
	for (const raw of names) {
		const n = raw.trim();
		if (n.length < 2) continue; // jamais un jeton trop court
		out = out.replace(new RegExp(escapeRegExp(n), 'gi'), ' ');
	}
	return out;
}

/**
 * Vérifie que chaque nombre du texte figure dans `allowed` — l'ensemble des
 * valeurs déjà calculées, exprimées **dans leur forme d'affichage** (ex. 7.5
 * pour « 7,5 % », 3 pour « 3 matchs », 1.85 pour une cote).
 *
 * @param epsilon tolérance d'arrondi (les probabilités sont arrondies au dixième).
 * @param maskNames noms propres à retirer du texte AVANT extraction (voir stripNames).
 */
export function checkNumbers(
	text: string,
	allowed: number[],
	epsilon = 0.05,
	maskNames: string[] = []
): NumbersResult {
	const cleaned = maskNames.length ? stripNames(text, maskNames) : text;
	const found = extractNumbers(cleaned);
	const offending: number[] = [];
	for (const n of found) {
		const matched = allowed.some((a) => Math.abs(a - n) <= epsilon);
		if (!matched) offending.push(n);
	}
	return { ok: offending.length === 0, offending };
}

/* ------------------------------------------------------------------------ */
/*  CONTRÔLE COMBINÉ                                                          */
/* ------------------------------------------------------------------------ */

export interface GuardResult {
	ok: boolean;
	vocabulary: VocabularyResult;
	numbers: NumbersResult;
}

/**
 * Contrôle complet à passer après CHAQUE génération de texte (brief §4.3/4.4).
 * `ok === false` → régénérer ; après 2 échecs, l'appelant bascule sur un
 * template sans chiffres.
 */
export function checkGeneratedText(
	text: string,
	allowedNumbers: number[],
	maskNames: string[] = []
): GuardResult {
	const vocabulary = checkVocabulary(text);
	const numbers = checkNumbers(text, allowedNumbers, 0.05, maskNames);
	return { ok: vocabulary.ok && numbers.ok, vocabulary, numbers };
}
