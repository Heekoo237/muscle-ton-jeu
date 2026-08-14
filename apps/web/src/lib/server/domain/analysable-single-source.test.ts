import { describe, it, expect } from 'vitest';

/**
 * RÈGLE UNIQUE « analysable » (résolu ≠ analysable). La règle « une sélection est
 * analysable ssi elle est résolue ET pourvue d'une probabilité » vit dans UNE seule
 * fonction — `isAnalysable` (ticket.ts). Tout compteur de lignes analysables passe
 * par elle (serveur) ou par le booléen `analysable` du VM qu'elle a calculé (client).
 *
 * Ce test protège la règle dans six mois, pas le commentaire : il échoue si un autre
 * module RECOUPLE en ligne `etatResolution === 'certain'` à une vérification de
 * `probabilite` — c'est exactement la triple copie qui a produit le bug de l'écran
 * de validation (ligne cochée verte, comptée, puis « non analysée » au résultat).
 *
 * Ce que le test NE bloque PAS : les prédicats VOISINS mais DISTINCTS, qui ne
 * couplent pas `certain` à `probabilite` — `isSettleable` (certain + marché + match,
 * pour le règlement), ou les comptes « résolus » de la part gratuite (dashboard,
 * image de partage). Seul le recouplage certain+probabilité est réservé.
 */

// Tous les sources de l'app (relatif à ce fichier : src/lib/server/domain → src).
const sources = import.meta.glob('../../../**/*.{ts,svelte}', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

// L'idiome réservé : `etatResolution === 'certain'` puis, dans la MÊME expression
// (sans franchir ; { }), une mention de `probabilite`. C'est la signature de
// `isAnalysable` réimplémentée à la main.
const IDIOM = /etatResolution\s*===\s*['"]certain['"][^;{}]*probabilite/;

// Le SEUL fichier autorisé à porter la définition, plus ce test lui-même.
function estAutorise(chemin: string): boolean {
	return chemin.endsWith('/ticket.ts') || chemin.endsWith('/analysable-single-source.test.ts');
}

describe('règle « analysable » — source unique (isAnalysable)', () => {
	it('la définition vit bien dans ticket.ts', () => {
		const ticket = Object.entries(sources).find(([p]) => p.endsWith('/ticket.ts'))?.[1] ?? '';
		expect(ticket).toContain('export function isAnalysable');
		expect(IDIOM.test(ticket)).toBe(true); // ticket.ts EST l'endroit qui couple certain+probabilité
	});

	it('aucun autre module ne réimplémente certain + probabilité en ligne', () => {
		const coupables = Object.entries(sources)
			.filter(([chemin]) => !estAutorise(chemin))
			.filter(([, src]) => IDIOM.test(src))
			.map(([chemin]) => chemin);
		expect(coupables, `réimplémentent isAnalysable au lieu de l'appeler : ${coupables.join(', ')}`).toEqual(
			[]
		);
	});
});
