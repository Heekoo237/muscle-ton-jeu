import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { getAppSession } from '$lib/server/session';
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';

/**
 * Tableau de bord superadmin — STRICT MINIMUM (bêta). Deux blocs, deux nombres
 * chacun : inscriptions et analyses, sur une période choisie.
 *
 * Sécurité (chemin privilégié, mieux protégé que le reste) :
 *  (a) autorité UNIQUE = liste blanche d'e-mails en variable d'env `SUPERADMIN_EMAILS`.
 *      Aucun rôle en base : une ligne `users` compromise ne donne jamais l'accès.
 *  (b) vérification SERVEUR à chaque chargement ; `error(404)` si non autorisé — pas
 *      403 : on ne révèle même pas que la page existe. Aucun masquage d'interface.
 *  (c) LECTURE SEULE : uniquement ce `load`, aucune action, aucun formulaire.
 *  (d) AUCUNE donnée personnelle : les deux RPC ne renvoient que des entiers
 *      (agrégats) — structurellement, ni e-mail, ni numéro, ni contenu ne peut sortir.
 *  (e) URL non devinable, jamais indexée (`X-Robots-Tag: noindex`, hors robots.txt
 *      pour ne pas publier le slug).
 * Chaque accès autorisé est journalisé : qui (e-mail), quand.
 */

type Periode = 'jour' | '7j' | '30j';

// Fuseau des utilisateurs (Afrique de l'Ouest/Centrale, UTC+1). « Aujourd'hui »
// commence à MINUIT LOCAL, pas à minuit UTC : en soirée — juste quand ils jouent —
// une fenêtre calée sur Londres montrerait déjà « demain ». Les chiffres suivent
// LEUR journée. 7j/30j restent glissants (insensibles au fuseau).
const UTC_OFFSET_MS = 3_600_000;

/** Début de la fenêtre, en ISO. « jour » = depuis minuit LOCAL (UTC+1) ; 7j/30j = glissant. */
function depuisDe(p: Periode, nowMs: number): string {
	if (p === 'jour') {
		const local = new Date(nowMs + UTC_OFFSET_MS);
		local.setUTCHours(0, 0, 0, 0); // minuit dans le repère local…
		return new Date(local.getTime() - UTC_OFFSET_MS).toISOString(); // …reconverti en UTC
	}
	const jours = p === '30j' ? 30 : 7;
	return new Date(nowMs - jours * 86_400_000).toISOString();
}

/** Liste blanche d'e-mails (minuscules, sans espaces). Vide = personne n'entre. */
function emailsAutorises(): string[] {
	return (env.SUPERADMIN_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
}

/** Première ligne d'un retour de RPC `RETURNS TABLE` (tableau) ou objet, sécurisé. */
function premier(data: unknown): { total: number; periode: number } {
	const row = Array.isArray(data) ? data[0] : data;
	const r = (row ?? {}) as { total?: unknown; periode?: unknown };
	return { total: Number(r.total ?? 0), periode: Number(r.periode ?? 0) };
}

export const load: PageServerLoad = async (event) => {
	// (a) + (b) : autorité env, vérif serveur, 404 muet.
	const session = await getAppSession(event);
	const email = session?.email?.toLowerCase() ?? null;
	const autorises = emailsAutorises();
	if (!email || autorises.length === 0 || !autorises.includes(email)) {
		error(404, 'Introuvable');
	}
	// Journal d'accès : qui, quand. Aucune donnée d'autrui.
	console.log(`[veille] accès superadmin ${email} @ ${new Date().toISOString()}`);

	// (e) jamais indexée, même si le slug fuite.
	event.setHeaders({ 'X-Robots-Tag': 'noindex, nofollow' });

	const brut = event.url.searchParams.get('p');
	const periode: Periode = brut === 'jour' || brut === '30j' ? brut : '7j';
	const depuis = depuisDe(periode, Date.now());

	// Sans Supabase (local/factice) : zéros honnêtes, jamais de démo.
	if (!isSupabaseConfigured()) {
		return {
			periode,
			inscriptions: { total: 0, periode: 0 },
			analyses: { total: 0, periode: 0 }
		};
	}

	// (d) Deux requêtes, agrégats seuls. Aucune boucle par ticket, aucun N+1.
	const sb = supabaseAdmin();
	const [ins, ana] = await Promise.all([
		sb.rpc('admin_stats_inscriptions', { p_depuis: depuis }),
		sb.rpc('admin_stats_analyses', { p_depuis: depuis })
	]);

	return {
		periode,
		inscriptions: premier(ins.data),
		analyses: premier(ana.data)
	};
};
