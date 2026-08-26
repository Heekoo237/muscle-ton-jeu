/**
 * supabasePage.ts — Lecture d'une COLLECTION Supabase SANS se faire tronquer.
 *
 * PostgREST (l'API auto de Supabase) plafonne toute réponse au réglage « Max Rows »
 * du projet (1000 par défaut). Une requête qui dépasse ce plafond REUSSIT quand même,
 * en renvoyant les 1000 premières lignes, SANS erreur — et un `.limit(50000)` n'y
 * change RIEN : le plafond serveur prime sur le `limit` client. C'est le défaut qui a
 * fait disparaître une équipe (« Real Racing Club de Santander ») de la résolution :
 * la table `teams` faisait > 1000 lignes, l'équipe tombait hors des 1000 renvoyées, et
 * son match ressortait `non_resolu` sans que rien ne le signale.
 *
 * `selectAll` pagine par `.range()` jusqu'à épuisement — indépendant du réglage
 * « Max Rows », donc ne se re-cassera pas au prochain palier de données.
 *
 * CONTRAT : `build()` doit renvoyer une requête AVEC un `.order(...)` DÉTERMINISTE et
 * SANS `.range()`/`.limit()`. Sans ordre stable, une ligne peut changer de page entre
 * deux appels et être vue deux fois ou jamais. On rappelle une requête NEUVE à chaque
 * page (les query builders supabase-js sont à usage unique).
 */

/** Taille de page. DOIT rester ≤ au « Max Rows » du projet (1000 par défaut) : au-delà,
 *  une page « pleine » serait déjà tronquée par le serveur et la boucle s'arrêterait
 *  trop tôt. 1000 = la valeur par défaut de Supabase ; on ne descend que si le projet
 *  abaisse Max Rows. */
export const PAGE = 1000;

/** Objet minimal attendu : une requête supabase-js sur laquelle on peut appeler `.range()`. */
interface Rangeable {
	range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

/**
 * Récupère TOUTES les lignes d'une requête de collection, page par page. `build` est
 * rappelé à chaque page (requête neuve + `.range()`). S'arrête quand une page revient
 * incomplète (< PAGE) — la seule condition d'arrêt fiable.
 */
export async function selectAll<T>(build: () => Rangeable): Promise<T[]> {
	const out: T[] = [];
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await build().range(from, from + PAGE - 1);
		if (error) throw new Error(error.message);
		const batch = (data ?? []) as T[];
		out.push(...batch);
		if (batch.length < PAGE) break;
	}
	return out;
}
