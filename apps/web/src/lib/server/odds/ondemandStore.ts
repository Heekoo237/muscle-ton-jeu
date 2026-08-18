/**
 * ondemandStore.ts — Lecture du JOURNAL de la récupération à la demande
 * (`ondemand_calls`) : appels/jour, succès, crédits consommés, et l'état du
 * DISJONCTEUR sur la fenêtre récente. Sert l'exigence « journalise tout » et donne
 * à la surveillance de quoi ALERTER si le taux d'échec monte.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

export interface OndemandRapport {
	depuis: string | null;
	appels: number;
	succes: number;
	echecs: number;
	credits: number;
	matchsEcrits: number;
	tauxEchec: number; // 0..1 sur la période
	parKind: { league: number; event: number };
	/** Répartition des ABANDONS par raison (plus jamais un silence). Ex. `{ budget: 3,
	 *  deja_connu: 12, non_apparie: 1 }`. Un abandon = une cible non comblée + pourquoi. */
	abandons: Record<string, number>;
}

/** Journal agrégé des appels depuis `depuisIso` (null = tout). */
export async function computeOndemand(depuisIso: string | null): Promise<OndemandRapport> {
	const vide: OndemandRapport = {
		depuis: depuisIso,
		appels: 0,
		succes: 0,
		echecs: 0,
		credits: 0,
		matchsEcrits: 0,
		tauxEchec: 0,
		parKind: { league: 0, event: 0 },
		abandons: {}
	};
	if (!isSupabaseConfigured()) return vide;
	let q = supabaseAdmin()
		.from('ondemand_calls')
		.select('kind, ok, credits, matchs_ecrits, raison, cree_le')
		.limit(50000);
	if (depuisIso) q = q.gte('cree_le', depuisIso);
	const { data, error } = await q;
	if (error) throw error;
	const rows = (data ?? []) as {
		kind: 'league' | 'event' | 'skip';
		ok: boolean;
		credits: number;
		matchs_ecrits: number;
		raison: string | null;
	}[];
	const r: OndemandRapport = { ...vide, parKind: { league: 0, event: 0 }, abandons: {} };
	for (const row of rows) {
		// Un 'skip' n'est PAS un appel fournisseur : c'est un abandon (aucun crédit).
		if (row.kind === 'skip') {
			const cause = row.raison ?? 'inconnu';
			r.abandons[cause] = (r.abandons[cause] ?? 0) + 1;
			continue;
		}
		r.appels++;
		if (row.ok) r.succes++;
		else r.echecs++;
		r.credits += row.credits ?? 0;
		r.matchsEcrits += row.matchs_ecrits ?? 0;
		if (row.kind === 'league') r.parKind.league++;
		else if (row.kind === 'event') r.parKind.event++;
		// Un appel réussi qui n'écrit rien porte aussi une raison (non_apparie…).
		if (row.ok && (row.matchs_ecrits ?? 0) === 0 && row.raison) {
			r.abandons[row.raison] = (r.abandons[row.raison] ?? 0) + 1;
		}
	}
	r.tauxEchec = r.appels ? Math.round((1000 * r.echecs) / r.appels) / 1000 : 0;
	return r;
}
