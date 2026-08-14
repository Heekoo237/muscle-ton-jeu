/**
 * cost.ts — Coût réel d'UNE rédaction. Un seul appel par ticket (tous les
 * fragiles ensemble). Même modèle et même tarif que la vision (Haiku 4.5) :
 * entrée 1 $/M tokens, sortie 5 $/M. On mesure à chaque rédaction, pas après coup.
 */
import { readCostUsd, FCFA_PER_USD, type Usage } from '$lib/server/services/vision/cost';

export { readCostUsd, FCFA_PER_USD };
export type { Usage };

/** Ligne de log lisible pour une rédaction (coût USD + F CFA + parts d'usage). */
export function formatWritingCost(usage: Usage, nbRetraits: number): string {
	const usd = readCostUsd(usage);
	const fcfa = usd * FCFA_PER_USD;
	const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
	const output = usage.output_tokens ?? 0;
	return (
		`[rédaction] ticket rédigé — ${nbRetraits} retrait(s), entrée ${input} tok, sortie ${output} tok · ` +
		`coût ~$${usd.toFixed(5)} (≈ ${fcfa.toFixed(1)} F CFA)`
	);
}
