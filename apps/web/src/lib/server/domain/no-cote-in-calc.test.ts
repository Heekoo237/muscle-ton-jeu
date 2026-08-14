import { describe, it, expect } from 'vitest';
import ticketSrc from './ticket.ts?raw';
import settleSrc from './settle.ts?raw';

/**
 * Règle d'or n°1 — la cote transcrite par le LLM (`coteSaisie`) est affichée pour
 * vérification, JAMAIS utilisée dans un calcul. Ce test protège la règle dans six
 * mois, pas le commentaire : il échoue si `coteSaisie` réapparaît dans un module
 * de calcul (fragilité, produit, renforcement, règlement). Le stockage et
 * l'affichage (ticketStore, VM) restent légitimes et hors de ce périmètre.
 */
describe("coteSaisie n'entre dans aucun module de calcul (règle d'or n°1)", () => {
	it("ticket.ts (fragilité, produit, renforcement) n'utilise jamais coteSaisie", () => {
		expect(ticketSrc).not.toContain('coteSaisie');
	});
	it("settle.ts (règlement) n'utilise jamais coteSaisie", () => {
		expect(settleSrc).not.toContain('coteSaisie');
	});
});
