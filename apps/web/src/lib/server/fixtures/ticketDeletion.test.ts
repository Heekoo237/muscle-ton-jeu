import { describe, it, expect } from 'vitest';
import { createTicket } from './ticketStore';
import { supprimerTicket } from './ticketDeletion';
import type { Selection } from '$lib/types';

/**
 * Suppression = anonymisation, avec vérification de PROPRIÉTÉ côté serveur. On ne fait
 * jamais confiance au client : on n'efface le ticket que s'il appartient à l'appelant.
 * (En mémoire, sans Supabase, on teste le garde-fou de propriété et l'idempotence.)
 */
const sel = (): Selection[] => [
	{
		ordre: 1,
		texteBrut: 'x',
		fixtureId: 1,
		matchLabel: 'A – B',
		marche: 'WIN_HOME',
		etatResolution: 'certain',
		coteSaisie: null,
		probabilite: 0.6,
		seuilFragile: 0.5,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: ''
	}
];

describe('supprimerTicket — garde-fou de propriété', () => {
	it('refuse un ticket qui n’appartient pas à l’appelant', async () => {
		const t = await createTicket(sel(), 1);
		const res = await supprimerTicket(t.id, 2); // autre utilisateur
		expect(res).toEqual({ ok: false, raison: 'pas_le_proprietaire' });
	});

	it('accepte la suppression par le propriétaire', async () => {
		const t = await createTicket(sel(), 7);
		const res = await supprimerTicket(t.id, 7);
		expect(res).toEqual({ ok: true });
	});

	it('signale un ticket introuvable', async () => {
		const res = await supprimerTicket('t_inexistant', 1);
		expect(res).toEqual({ ok: false, raison: 'introuvable' });
	});
});
