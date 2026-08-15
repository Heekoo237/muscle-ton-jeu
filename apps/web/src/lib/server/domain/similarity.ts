/**
 * similarity.ts — Ressemblance de NOMS d'équipe, pour la résolution par PAIRE.
 *
 * On ne réconcilie pas un nom contre l'univers des équipes ; on identifie une PAIRE
 * (les deux équipes du ticket) contre la liste des fixtures. Deux ressemblances qui
 * pointent le MÊME match sont un signal bien plus sûr qu'une seule. Ce module ne
 * fournit que la brique élémentaire : la ressemblance entre DEUX noms.
 *
 * Mesure = max(Dice sur bigrammes de caractères, contenance par tokens entiers) :
 *  - Dice de caractères attrape les variantes d'ORTHOGRAPHE (« espanol »/« espanyol »,
 *    « seville »/« sevilla », « goztep »/« goztepe ») ;
 *  - la contenance par tokens attrape les AJOUTS de mots (« aris »/« aris thessaloniki »,
 *    « newcastle »/« newcastle united »).
 *
 * ON NE RETIRE PAS les affixes (« fc », « sg », « sc »…). MESURÉ, pas supposé : les
 * retirer fusionnait « Paris SG » et « Paris FC » — deux clubs distincts qui ne
 * diffèrent QUE par cet affixe. Les garder sépare ces clubs sans coûter en rappel
 * (voir pair-calibration.test.ts : à TAU 0,50, rappel 94,9 %, fausse paire 0,0 %).
 *
 * Ce qu'elle NE peut PAS attraper — et c'est prouvé, pas supposé : le SÉMANTIQUE et la
 * TRANSLITTÉRATION (« guimaraes »/« vitoria » = 0,00 ; « corum belediyespor »/« corum fk »
 * = 0,38). Ces cas restent la mission de la carte d'alias — elle ne disparaît jamais.
 *
 * AUCUN LLM ici : calcul déterministe pur (règle d'or n°1). Aucun accès réseau/base.
 */

/** Minuscule, sans accents, sans ponctuation, espaces normalisés. */
function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9 ]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Bigrammes de caractères sur le nom normalisé (espaces retirés). */
function bigrams(s: string): Set<string> {
	const j = normalize(s).replace(/ /g, '');
	if (j.length < 2) return new Set(j ? [j] : []);
	const out = new Set<string>();
	for (let i = 0; i < j.length - 1; i++) out.add(j.slice(i, i + 2));
	return out;
}

/** Coefficient de Dice sur les bigrammes : 2·|A∩B| / (|A|+|B|). */
function diceBigrams(a: string, b: string): number {
	const A = bigrams(a);
	const B = bigrams(b);
	if (!A.size || !B.size) return 0;
	let inter = 0;
	for (const g of A) if (B.has(g)) inter++;
	return (2 * inter) / (A.size + B.size);
}

/**
 * Contenance par tokens : TOUS les tokens du nom le plus court (affixes courts
 * COMPRIS) figurent comme mots entiers dans l'autre → 1. Attrape « aris » ⊂ « aris
 * thessaloniki » ; sépare « paris sg » de « paris fc » (aucun n'est inclus dans l'autre).
 */
function tokenContainment(a: string, b: string): number {
	const ta = new Set(normalize(a).split(' ').filter(Boolean));
	const tb = new Set(normalize(b).split(' ').filter(Boolean));
	if (!ta.size || !tb.size) return 0;
	const [short, long] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
	for (const t of short) if (!long.has(t)) return 0;
	return 1;
}

/**
 * Ressemblance de deux noms d'équipe dans [0, 1]. Déterministe, symétrique.
 * `max` des deux mesures : orthographe OU ajout de mots suffit, jamais l'inverse.
 */
export function teamSimilarity(a: string, b: string): number {
	return Math.max(diceBigrams(a, b), tokenContainment(a, b));
}
