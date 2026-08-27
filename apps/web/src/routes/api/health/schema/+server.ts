import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isSupabaseConfigured } from '$lib/server/supabase';
import { cronAutorise } from '$lib/server/cronAuth';
import { checkSchema } from '$lib/server/schemaCheck';

/**
 * Vérification à la demande du décalage code/base (le pendant humain de la
 * surveillance 6 h). À ouvrir après chaque migration/déploiement :
 *   /api/health/schema?key=<CRON_SECRET>
 * Renvoie la liste EXACTE des objets manquants, avec leur numéro de migration.
 * Réservée au porteur du secret cron (comme les autres diagnostics).
 *
 * COMMIT DÉPLOYÉ INCLUS (règle n°7 appliquée au schéma) : on renvoie le commit que
 * l'app exécute (`VERCEL_GIT_COMMIT_SHA`, le même que /version). Un objet manquant
 * dit alors « le déploiement <commit> est EN AVANCE sur ta base » — un seul appel
 * répond à « quel code tourne » ET « que manque-t-il », sans corréler deux endpoints
 * à la main. Ne REMPLACE PAS l'annonce en première ligne d'une migration : les deux,
 * jamais l'un à la place de l'autre (un contrôle ne dispense pas de la discipline).
 */
export const GET: RequestHandler = async (event) => {
	if (!cronAutorise(event)) error(403, 'Accès refusé.');
	if (!isSupabaseConfigured()) return json({ configured: false });
	const res = await checkSchema();
	const sha = env.VERCEL_GIT_COMMIT_SHA ?? '';
	const commitCourt = sha ? sha.slice(0, 8) : 'dev';
	// Verdict humain, sans corréler /version à la main : le commit + ce qui manque.
	const diagnostic = res.ok
		? `Base alignée avec le déploiement ${commitCourt}.`
		: `Déploiement ${commitCourt} EN AVANCE sur la base : ${res.manquants.length} objet(s) manquant(s). Appliquer les migrations listées, puis rouvrir.`;
	// 200 si aligné, 503 si un objet manque : un moniteur externe voit le rouge au code HTTP.
	return json(
		{ configured: true, commit: sha || 'dev', commitCourt, diagnostic, ...res },
		{ status: res.ok ? 200 : 503 }
	);
};
