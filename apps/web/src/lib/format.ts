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
