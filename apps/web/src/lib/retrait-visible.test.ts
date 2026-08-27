import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import PaperTicketCompare from '$lib/components/PaperTicketCompare.svelte';
import { buildReinforced } from '$lib/server/domain/ticket';
import { createTicket, updateTicket, getTicket } from '$lib/server/fixtures/ticketStore';
import { demoTicketDetail } from '$lib/server/demo';
import { renderShareSvg } from '$lib/server/shareImage';
import type { Selection } from '$lib/types';

/**
 * Le ticket renforcé DOIT montrer les lignes retirées barrées, sur les trois
 * chemins qui partagent le composant papier : résultat immédiat, historique,
 * image de partage. Sans ce test, la régression (rien de barré) revient.
 */
function sel(ordre: number, proba: number, seuil: number): Selection {
	return {
		ordre,
		texteBrut: `m${ordre}`,
		fixtureId: ordre,
		matchLabel: `Home${ordre} – Away${ordre}`,
		marche: 'WIN_HOME',
		etatResolution: 'certain',
		coteSaisie: 1.8,
		probabilite: proba,
		seuilFragile: seuil,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: `Home${ordre} gagne`
	};
}

/** Cinq sélections : quatre solides, une faible (retirée). */
function jeuAvecUnRetrait(): Selection[] {
	return [sel(1, 0.8, 0.5), sel(2, 0.8, 0.5), sel(3, 0.8, 0.5), sel(4, 0.8, 0.5), sel(5, 0.3, 0.9)];
}

describe('composant papier — une ligne retirée est barrée et étiquetée', () => {
	it('retiree=true → rature (classe strike) + étiquette « retiré »', () => {
		const { body } = render(PaperTicketCompare, {
			props: {
				lines: [
					{ matchLabel: 'LENS – NICE', libelleFr: 'Plus de 2,5 buts', fragile: true, retiree: true, analysable: true },
					{ matchLabel: 'REAL – SEVILLA', libelleFr: 'Real gagne', fragile: false, retiree: false, analysable: true }
				],
				probaTotalePct: 4.2,
				probaRenforceePct: 9.1
			}
		});
		expect(body).toContain('strike'); // rature appliquée
		expect(body).toContain('retiré'); // étiquette de fin de ligne
	});

	it('aucune ligne retirée → ni rature ni étiquette', () => {
		const { body } = render(PaperTicketCompare, {
			props: {
				lines: [{ matchLabel: 'A – B', libelleFr: 'A gagne', fragile: false, retiree: false, analysable: true }],
				probaTotalePct: 5,
				probaRenforceePct: 5
			}
		});
		expect(body).not.toContain('strike');
		expect(body).not.toContain('retiré');
	});
});

describe('chemin 1 — résultat immédiat (buildReinforced)', () => {
	it('la sélection faible est marquée retirée', () => {
		const r = buildReinforced(jeuAvecUnRetrait());
		expect(r.selections.some((s) => s.retireeDuRenforce)).toBe(true);
		expect(r.selections.find((s) => s.ordre === 5)?.retireeDuRenforce).toBe(true);
	});
});

describe('chemin 2 — historique (drapeaux figés en base, relus tels quels)', () => {
	it('le drapeau retiré survit à l’enregistrement puis à la relecture', async () => {
		const r = buildReinforced(jeuAvecUnRetrait());
		const t = await createTicket(r.selections, null, 'emp-retrait-test');
		// Ce que fait désormais l'écran de résultat : figer les sélections renforcées.
		await updateTicket(t.id, { selections: r.selections });
		const back = await getTicket(t.id);
		expect(back?.selections.some((s) => s.retireeDuRenforce)).toBe(true);
	});
});

describe('chemin 3 — image de partage', () => {
	it('la colonne renforcée barre la ligne retirée et affiche « RETIRÉ »', () => {
		const svg = renderShareSvg(
			{
				probaTotalePct: 4.2,
				probaRenforceePct: 9.1,
				probaTotale: 0.042,
				probaRenforcee: 0.091,
				nbRetirees: 1,
				lignes: [
					{ matchLabel: 'LENS – NICE', libelleFr: 'Plus de 2,5 buts', fragile: true, retiree: true },
					{ matchLabel: 'REAL – SEVILLA', libelleFr: 'Real gagne', fragile: false, retiree: false }
				]
			},
			false
		);
		expect(svg).toContain('RETIRÉ'); // pastille
		expect(svg).toContain('stroke-width="3"'); // rature nette
	});
});

describe('landing (démo) — l’exemple montre bien un retrait', () => {
	it('le détail de démonstration contient au moins une ligne retirée', () => {
		const d = demoTicketDetail('demo-1', 0);
		expect(d.lignes.some((l) => l.retiree)).toBe(true);
	});
});
