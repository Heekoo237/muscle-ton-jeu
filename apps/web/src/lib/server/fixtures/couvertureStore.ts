/**
 * couvertureStore.ts — Répartition des CAUSES de non-analyse, fenêtrée dans le temps.
 *
 * Sert à suivre l'évolution des refus — en particulier `sans_donnee` (trou
 * transitoire) après le correctif d'intérim cote seule : on regarde le taux sur les
 * tickets analysés RÉCEMMENT, et il doit s'effondrer. La cause est dérivée de ce qui
 * est déjà persisté (`selections`), aucun nouveau stockage.
 *
 * NB : la répartition sépare aussi `non_resolu` (équipes reconnues, aucun fixture —
 * NOTRE reconnaissance) de `hors_couverture` (championnat absent du catalogue — limite
 * externe). C'est la séparation (c) vs (a).
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import { selectAll } from '$lib/server/supabasePage';

export interface CouvertureCause {
	cause: string;
	n: number;
	pct: number;
}
export interface CouvertureRapport {
	total: number;
	depuis: string | null;
	causes: CouvertureCause[];
}

type Row = {
	etat_resolution: string | null;
	probabilite: number | null;
	raison: string | null;
	tickets: { analyse_le: string | null } | { analyse_le: string | null }[] | null;
};

/** Cause d'une sélection, MÊME logique que la requête SQL de diagnostic. */
function causeDe(r: Row): string {
	const certain = r.etat_resolution === 'certain';
	const aProba = r.probabilite !== null && r.probabilite !== undefined;
	if (certain && aProba) return 'analysé';
	if (certain && !aProba) return 'sans_donnee';
	return r.raison ?? 'non_resolu';
}

function analyseLe(r: Row): string | null {
	const t = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
	return t?.analyse_le ?? null;
}

/** Répartition des causes pour les tickets analysés depuis `depuisIso` (null = tout). */
export async function computeCouverture(depuisIso: string | null): Promise<CouvertureRapport> {
	if (!isSupabaseConfigured()) return { total: 0, depuis: depuisIso, causes: [] };
	// Paginé : `.limit(50000)` était TROMPEUR — PostgREST plafonnait la réponse à 1000,
	// donc le taux non_resolu se calculait sur ~1000 sélections au lieu de toutes. Ordre
	// stable (id) obligatoire pour la pagination.
	const data = await selectAll<Row>(() =>
		supabaseAdmin()
			.from('selections')
			.select('etat_resolution, probabilite, raison, tickets(analyse_le)')
			.order('id', { ascending: true })
	);

	const rows = (data as Row[]).filter((r) => {
		const a = analyseLe(r);
		if (!a) return false; // ticket jamais analysé : hors périmètre
		return depuisIso ? a >= depuisIso : true;
	});

	const compte = new Map<string, number>();
	for (const r of rows) compte.set(causeDe(r), (compte.get(causeDe(r)) ?? 0) + 1);
	const total = rows.length;
	const causes = [...compte.entries()]
		.map(([cause, n]) => ({ cause, n, pct: total ? Math.round((1000 * n) / total) / 10 : 0 }))
		.sort((a, b) => b.n - a.n);
	return { total, depuis: depuisIso, causes };
}
