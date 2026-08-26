/**
 * lecturesStore.ts — Échantillon des LECTURES vision : le texte brut lu, à côté du
 * marché résolu. Sert à rendre OBSERVABLE la réécriture auto-cohérente (le seul
 * risque que le code ne peut pas attraper) : on compare un échantillon avec les
 * VRAIES captures. Si `texteBrut` ne correspond pas au marché résolu — ou à la
 * capture d'origine — la vision a réécrit.
 *
 * Aucune donnée personnelle : une ligne de pari (« Celtic - LASK  1ère mi-temps… »)
 * n'est pas sensible, et les captures elles-mêmes sont purgées à 30 jours (I2).
 * Réservé au secret cron. Lecture seule sur des données déjà persistées.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

export interface LectureEchantillon {
	analyseLe: string | null;
	texteBrut: string;
	matchLabel: string;
	marche: string | null;
	libelleFr: string;
	raison: string | null;
	coteSaisie: number | null;
}

type Row = {
	texte_brut: string | null;
	match_label: string | null;
	marche: string | null;
	libelle_fr: string | null;
	raison: string | null;
	cote_saisie: number | string | null;
	tickets: { analyse_le: string | null } | { analyse_le: string | null }[] | null;
};

function analyseLe(r: Row): string | null {
	const t = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
	return t?.analyse_le ?? null;
}

/** Les `n` lectures les plus récentes (texte brut ↔ marché résolu). */
export async function computeLectures(n: number): Promise<{ n: number; lignes: LectureEchantillon[] }> {
	if (!isSupabaseConfigured()) return { n: 0, lignes: [] };
	// On ne veut que les `n` plus RÉCENTES : on borne à 1000 lignes récentes (id
	// décroissant) plutôt que balayer toute la table. `.limit(20000)` était trompeur —
	// PostgREST plafonnait à 1000 de toute façon, mais SANS ordre : on tombait sur 1000
	// lignes ARBITRAIRES, pas les récentes. Ordre explicite + borne assumée.
	const { data, error } = await supabaseAdmin()
		.from('selections')
		.select('texte_brut, match_label, marche, libelle_fr, raison, cote_saisie, tickets(analyse_le)')
		.order('id', { ascending: false })
		.limit(1000);
	if (error) throw error;
	const lignes = ((data ?? []) as Row[])
		.filter((r) => analyseLe(r) !== null) // ticket réellement analysé
		.map((r) => ({
			analyseLe: analyseLe(r),
			texteBrut: r.texte_brut ?? '',
			matchLabel: r.match_label ?? '',
			marche: r.marche,
			libelleFr: r.libelle_fr ?? '',
			raison: r.raison,
			coteSaisie: r.cote_saisie === null ? null : Number(r.cote_saisie)
		}))
		.sort((a, b) => (b.analyseLe ?? '').localeCompare(a.analyseLe ?? ''))
		.slice(0, n);
	return { n: lignes.length, lignes };
}
