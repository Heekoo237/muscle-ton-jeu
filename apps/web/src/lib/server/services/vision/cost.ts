/**
 * cost.ts — Coût réel d'une lecture de ticket. La vision est notre SEULE dépense
 * vraiment variable (1 à 3 appels par ticket) : on la mesure à chaque lecture,
 * pas après coup. Fonctions pures, testables sans réseau.
 *
 * Tarif Claude Haiku 4.5 (rapide + bon marché) : entrée 1 $/M tokens, sortie 5 $/M.
 * Lecture de cache facturée ~0,1× l'entrée. Repère produit : un ticket se vend
 * 500 F CFA (~0,76 €) ; au-delà de 10 % du prix (~50 F CFA), il faut optimiser.
 */
const INPUT_USD_PER_MTOK = 1.0;
const OUTPUT_USD_PER_MTOK = 5.0;
const CACHE_READ_FACTOR = 0.1;

/** Taux indicatif USD → F CFA (XOF). Ajustable ; sert l'ordre de grandeur, pas la compta. */
export const FCFA_PER_USD = 600;

export interface Usage {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
}

/** Coût d'une lecture en dollars, à partir de l'usage renvoyé par l'API. */
export function readCostUsd(usage: Usage): number {
	const input = usage.input_tokens ?? 0;
	const cacheWrite = usage.cache_creation_input_tokens ?? 0;
	const cacheRead = usage.cache_read_input_tokens ?? 0;
	const output = usage.output_tokens ?? 0;
	return (
		((input + cacheWrite) * INPUT_USD_PER_MTOK +
			cacheRead * INPUT_USD_PER_MTOK * CACHE_READ_FACTOR +
			output * OUTPUT_USD_PER_MTOK) /
		1_000_000
	);
}

/** Ligne de log lisible pour une lecture (coût USD + F CFA + parts d'usage). */
export function formatCostLine(usage: Usage, images: number): string {
	const usd = readCostUsd(usage);
	const fcfa = usd * FCFA_PER_USD;
	const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
	const output = usage.output_tokens ?? 0;
	return (
		`[vision] ticket lu — ${images} capture(s), entrée ${input} tok, sortie ${output} tok · ` +
		`coût ~$${usd.toFixed(5)} (≈ ${fcfa.toFixed(1)} F CFA)`
	);
}
