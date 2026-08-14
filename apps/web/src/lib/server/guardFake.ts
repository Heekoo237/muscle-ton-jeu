/**
 * guardFake.ts — Garde-fou : jamais de service FACTICE en production.
 *
 * Les services (sports, predictions, vision) retombent sur un mode factice quand
 * leurs variables d'environnement manquent — pratique en local, INTERDIT en
 * production. Une variable mal configurée ne doit JAMAIS nous faire servir des
 * matchs qui n'existent pas ou des chiffres inventés (CLAUDE.md, règles d'or).
 *
 * En production, un service factice fait échouer le démarrage avec un message
 * explicite, plutôt que de servir silencieusement des données de démonstration.
 */
import { dev, building } from '$app/environment';

/** Vrai quand l'app tourne pour de vrai : ni dev local, ni build/prérendu. */
export function isProductionRuntime(): boolean {
	return !dev && !building;
}

/** Décision pure (testable) : faut-il refuser ce service factice ? */
export function shouldRefuseFake(productionRuntime: boolean, isReal: boolean): boolean {
	return productionRuntime && !isReal;
}

/**
 * Lève en production si le service n'est pas réel. Appelé à la construction du
 * service (au chargement du module) : un déploiement mal configuré échoue tout
 * de suite, visiblement, au lieu de servir du factice.
 */
export function assertRealInProduction(service: string, isReal: boolean): void {
	if (shouldRefuseFake(isProductionRuntime(), isReal)) {
		throw new Error(
			`[config] Service « ${service} » en mode FACTICE en production. ` +
				'Renseigne les variables requises (Supabase, clé vision) avant de déployer. ' +
				"On ne sert jamais de données de démonstration à de vrais utilisateurs."
		);
	}
}
