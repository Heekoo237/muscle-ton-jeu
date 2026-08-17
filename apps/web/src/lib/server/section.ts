/**
 * section.ts — Isolation d'erreur PAR SECTION d'une page.
 *
 * Règle générale (pas un correctif page par page) : un `load` serveur peut lire
 * plusieurs choses indépendantes (crédits, historique, analyse du jour…). Si UNE
 * échoue, la page doit rester utilisable — on affiche le reste. On enveloppe donc
 * chaque lecture indépendante dans `section()` : l'échec est JOURNALISÉ (la cause
 * technique va dans les logs, jamais à l'écran) et on retombe sur une valeur de
 * repli. La page se rend ; l'utilisateur voit ce qui a marché.
 *
 * Ce qui NE doit PAS passer par `section()` : l'authentification (une session
 * absente redirige, elle ne « retombe » pas) et tout ce dont la page ne peut
 * VRAIMENT rien afficher sans. Pour ces cas, laisser l'erreur remonter au
 * `handleError` global, qui rend un message lisible + le lien support.
 */

/**
 * Exécute `fn`; en cas d'échec, journalise `[section:label]` côté serveur et
 * renvoie `fallback`. Ne relance jamais.
 */
export async function section<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		console.error(`[section:${label}] échec — repli affiché`, e);
		return fallback;
	}
}
