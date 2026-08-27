/**
 * format.ts — Formatage francophone. Virgule décimale, espace insécable avant
 * « % » et « F » (DESIGN.md §3.3). Ces fonctions produisent la forme d'affichage
 * — la même qui alimente `guards.checkNumbers`.
 */
const NBSP = ' ';

/** 0.075 → « 7,5 % ». Arrondi au dixième par défaut. */
export function formatPercent(prob: number, decimals = 1): string {
	const pct = (prob * 100).toFixed(decimals).replace('.', ',');
	return `${pct}${NBSP}%`;
}

/**
 * Pourcentage d'affichage HONNÊTE, en NOMBRE (les composants font `.toString()`).
 *
 * PROBLÈME corrigé : `Math.round(prob * 1000) / 10` arrondit 0,04 % à **0** — et
 * « 0 % » signifie IMPOSSIBLE. Sur un combiné long, la proba réelle peut valoir
 * 0,04 % (bien réelle) : l'afficher « 0 % » est une AFFIRMATION FAUSSE, pas une
 * imprécision. Même principe que la règle des mots techniques : un chiffre faux est
 * pire qu'un chiffre imprécis.
 *
 * Règle : 1 décimale par défaut (12,4 % · 40,1 % · 0,1 %) ; si l'arrondi tomberait à
 * 0 pour une valeur POSITIVE, on descend jusqu'à révéler un chiffre significatif
 * (0,04 % · 0,004 %), plafonné à 4 décimales. En deçà (parlays extrêmes), plancher
 * d'affichage 0,0001 % — jamais « 0 % » pour du positif. Une proba nulle reste 0.
 */
export function pctHonnete(prob: number): number {
	const pct = prob * 100;
	if (pct <= 0) return 0;
	for (let d = 1; d <= 4; d++) {
		const r = Number(pct.toFixed(d));
		if (r > 0) return r;
	}
	return 0.0001; // plancher : un positif microscopique n'est JAMAIS affiché « 0 % »
}

/** 500 → « 500 F ». Séparateur de milliers = espace insécable. */
export function formatFranc(montant: number): string {
	const s = Math.round(montant)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
	return `${s}${NBSP}F`;
}

/** Cote : deux décimales, point conservé (citation du ticket imprimé, mono). */
export function formatCote(cote: number): string {
	return cote.toFixed(2);
}
