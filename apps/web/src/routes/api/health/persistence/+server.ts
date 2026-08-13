import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { ensureAppUser, record } from '$lib/server/fixtures/userStore';
import { createTicket, getTicket, updateTicket } from '$lib/server/fixtures/ticketStore';
import type { Selection } from '$lib/types';

/**
 * Diagnostic complet de la persistance Supabase (aller-retour). À ouvrir une fois
 * sur Vercel après avoir appliqué 0001 + 0002 :
 *   /api/health/persistence
 * Crée un ticket de test, le relit, le met à jour, vérifie, puis nettoie.
 */
function testSelection(ordre: number, marche: Selection['marche']): Selection {
	return {
		ordre,
		texteBrut: `test ${ordre}`,
		fixtureId: 100 + ordre,
		matchLabel: `Équipe A ${ordre} – Équipe B ${ordre}`,
		marche,
		etatResolution: marche ? 'certain' : 'inconnu',
		coteSaisie: 1.5,
		probabilite: 0.6,
		fragile: false,
		retireeDuRenforce: false,
		libelleFr: marche ? 'Équipe A gagne' : ''
	};
}

export const GET: RequestHandler = async () => {
	if (!isSupabaseConfigured()) return json({ configured: false });

	const steps: Record<string, unknown> = {};
	try {
		const user = await ensureAppUser('__diag__', 'diag@example.com', 'Diag');
		steps.userId = user.id;

		const created = await createTicket(
			[testSelection(1, 'WIN_HOME'), testSelection(2, null)],
			user.id
		);
		steps.created = created.id;

		const read = await getTicket(created.id);
		steps.selectionsRelues = read?.selections.length ?? 0;

		await updateTicket(created.id, {
			statut: 'analyse',
			billing: { gratuit: true, credits: 0 },
			result: { probaTotalePct: 1.3, probaRenforceePct: 7.5, nbRetirees: 1, nbFragiles: 2 }
		});
		const read2 = await getTicket(created.id);
		steps.resultRenforce = read2?.result?.probaRenforceePct ?? null;

		// Registre de crédits (delta 0 → aucun effet sur le solde ni sur hasRecharged).
		await record(user.id, 0, 'offert');
		steps.ledgerInsert = 'ok';

		// Nettoyage du ticket de test (cascade sur les sélections).
		await supabaseAdmin().from('tickets').delete().eq('id', Number(created.id));
		steps.cleanup = 'ok';

		const ok = steps.selectionsRelues === 2 && steps.resultRenforce === 7.5;
		return json({ configured: true, ok, steps });
	} catch (e) {
		return json({ configured: true, ok: false, error: e instanceof Error ? e.message : String(e), steps });
	}
};
