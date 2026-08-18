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
		parKind: { league: 0, event: 0 }
	};
	if (!isSupabaseConfigured()) return vide;
	let q = supabaseAdmin()
		.from('ondemand_calls')
		.select('kind, ok, credits, matchs_ecrits, cree_le')
		.limit(50000);
	if (depuisIso) q = q.gte('cree_le', depuisIso);
	const { data, error } = await q;
	if (error) throw error;
	const rows = (data ?? []) as {
		kind: 'league' | 'event';
		ok: boolean;
		credits: number;
		matchs_ecrits: number;
	}[];
	const r = { ...vide };
	for (const row of rows) {
		r.appels++;
		if (row.ok) r.succes++;
		else r.echecs++;
		r.credits += row.credits ?? 0;
		r.matchsEcrits += row.matchs_ecrits ?? 0;
		if (row.kind === 'league') r.parKind.league++;
		else if (row.kind === 'event') r.parKind.event++;
	}
	r.tauxEchec = r.appels ? Math.round((1000 * r.echecs) / r.appels) / 1000 : 0;
	return r;
}
