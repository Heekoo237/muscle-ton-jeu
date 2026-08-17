import { describe, it, expect } from 'vitest';
import { runSettlement, type SettlePorts, type TicketARegler } from './notif-settle';
import type { FinalScore } from './settle';
import type { Selection } from '$lib/types';
import type { NotificationPayload } from '$lib/server/services/notifications';

function sel(ordre: number, fixtureId: number, marche: Selection['marche'], extra: Partial<Selection> = {}): Selection {
	return {
		ordre,
		texteBrut: '',
		fixtureId,
		matchLabel: `Match ${fixtureId}`,
		marche,
		etatResolution: 'certain',
		coteSaisie: null,
		probabilite: 0.5,
		seuilFragile: null,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: '',
		...extra
	};
}

/** Ports factices : réservation atomique par Set, envois et résultats mémorisés. */
function fakePorts(scores: Map<number, FinalScore>) {
	const reserved = new Set<string>();
	const sent: { userId: number; payload: NotificationPayload }[] = [];
	const results: { ticketId: number; resultat: string; originale: string }[] = [];
	const ports: SettlePorts = {
		async scoresFor(ids) {
			return new Map(ids.map((id) => [id, scores.get(id) ?? null]));
		},
		async reserver(cle) {
			if (reserved.has(cle)) return false;
			reserved.add(cle);
			return true;
		},
		async notify(userId, payload) {
			sent.push({ userId, payload });
		},
		async poserResultat(ticketId, resultat, originale) {
			results.push({ ticketId, resultat, originale });
		},
		urlTicket: (id) => `/dashboard/historique/${id}`
	};
	return { ports, sent, results, reserved };
}

const MIDI_UTC = Date.UTC(2026, 0, 15, 11, 0, 0); // 12 h locale — hors heures calmes
const NUIT_UTC = Date.UTC(2026, 0, 15, 23, 0, 0); // 0 h locale — heures calmes

describe('runSettlement — règlement + notification', () => {
	const ticket: TicketARegler = {
		id: 7,
		userId: 3,
		selections: [sel(1, 100, 'WIN_HOME'), sel(2, 101, 'WIN_HOME')]
	};

	it('tous les matchs terminés → résultat posé + UNE notification', async () => {
		const scores = new Map<number, FinalScore>([
			[100, { home: 2, away: 0 }],
			[101, { home: 1, away: 0 }]
		]);
		const { ports, sent, results } = fakePorts(scores);
		const stats = await runSettlement([ticket], ports, MIDI_UTC);
		// Les deux verdicts sont posés : ici les deux sélections gardées passent →
		// original ET renforcé « passe » (le ticket n'a rien retiré).
		expect(results).toEqual([{ ticketId: 7, resultat: 'passe', originale: 'passe' }]);
		expect(sent).toHaveLength(1);
		expect(sent[0].payload.corps).toContain('passé');
		expect(stats).toMatchObject({ regles: 1, notifies: 1 });
	});

	it('verdicts DIVERGENTS persistés : original tombe, renforcé passe', async () => {
		// La sélection RETIRÉE tombe, la GARDÉE passe → c'est exactement la preuve
		// « ton ticket serait tombé, le renforcé serait passé ». On vérifie que les
		// DEUX verdicts sont posés (l'original n'est plus jeté).
		const ticketRetrait: TicketARegler = {
			id: 9,
			userId: 3,
			selections: [
				sel(1, 200, 'WIN_HOME', { retireeDuRenforce: true }), // retirée
				sel(2, 201, 'WIN_HOME') // gardée
			]
		};
		const scores = new Map<number, FinalScore>([
			[200, { home: 0, away: 1 }], // la retirée tombe
			[201, { home: 1, away: 0 }] // la gardée passe
		]);
		const { ports, results } = fakePorts(scores);
		await runSettlement([ticketRetrait], ports, MIDI_UTC);
		expect(results).toEqual([{ ticketId: 9, resultat: 'passe', originale: 'tombe' }]);
	});

	it('IDEMPOTENCE : deux passages → une seule notification', async () => {
		const scores = new Map<number, FinalScore>([
			[100, { home: 2, away: 0 }],
			[101, { home: 1, away: 0 }]
		]);
		const { ports, sent } = fakePorts(scores);
		await runSettlement([ticket], ports, MIDI_UTC);
		const stats2 = await runSettlement([ticket], ports, MIDI_UTC); // rejoué
		expect(sent).toHaveLength(1); // JAMAIS deux
		expect(stats2.deja).toBe(1);
	});

	it('un match non terminé → ni résultat ni notification (en attente)', async () => {
		const scores = new Map<number, FinalScore>([[100, { home: 2, away: 0 }]]); // 101 manquant
		const { ports, sent, results } = fakePorts(scores);
		const stats = await runSettlement([ticket], ports, MIDI_UTC);
		expect(results).toHaveLength(0);
		expect(sent).toHaveLength(0);
		expect(stats.regles).toBe(0);
	});

	it('HEURES CALMES : résultat posé mais notification RETENUE (rien perdu)', async () => {
		const scores = new Map<number, FinalScore>([
			[100, { home: 2, away: 0 }],
			[101, { home: 1, away: 0 }]
		]);
		const { ports, sent, results, reserved } = fakePorts(scores);
		const nuit = await runSettlement([ticket], ports, NUIT_UTC);
		expect(results).toHaveLength(1); // résultat posé
		expect(sent).toHaveLength(0); // mais pas d'envoi
		expect(nuit.retenus).toBe(1);
		expect(reserved.size).toBe(0); // clé non réservée → réémettable au réveil

		// Au réveil (hors fenêtre), le même ticket est enfin notifié — une fois.
		const jour = await runSettlement([ticket], ports, MIDI_UTC);
		expect(sent).toHaveLength(1);
		expect(jour.notifies).toBe(1);
	});

	it('tombé sur la ligne retirée fragile → « le renforcé serait passé »', async () => {
		const t: TicketARegler = {
			id: 9,
			userId: 3,
			selections: [
				sel(1, 100, 'WIN_HOME', { fragile: true, retireeDuRenforce: true }), // retirée, perd
				sel(2, 101, 'WIN_HOME') // gardée, gagne
			]
		};
		const scores = new Map<number, FinalScore>([
			[100, { home: 0, away: 1 }], // la retirée tombe
			[101, { home: 2, away: 0 }] // la gardée passe
		]);
		const { ports, sent } = fakePorts(scores);
		await runSettlement([t], ports, MIDI_UTC);
		expect(sent[0].payload.corps).toContain('Le renforcé serait passé');
	});
});
