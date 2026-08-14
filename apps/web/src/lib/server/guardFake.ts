/**
 * guardFake.ts — Garde-fou : jamais de service FACTICE servi à un vrai utilisateur.
 *
 * Les services (sports, predictions, vision, rédaction, paiement) retombent sur
 * un mode factice quand leurs variables d'environnement manquent — pratique en
 * local, INTERDIT en production (CLAUDE.md, règles d'or).
 *
 * IMPORTANT — on refuse le factice À L'USAGE, jamais à l'import. Un garde-fou qui
 * lève au chargement du module ferait planter TOUTE page important la barrière de
 * services (le dashboard, par exemple, qui ne lit pourtant aucune capture) avec
 * une 500 brute. Ici, construire le service ne lève jamais ; c'est APPELER une
 * méthode d'un service factice en production qui lève une erreur claire, que
 * l'appelant transforme en message lisible.
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

/** Erreur levée quand un service factice est appelé en production. */
export class FakeServiceError extends Error {
	readonly service: string;
	constructor(service: string) {
		super(
			`[config] Service « ${service} » en mode FACTICE en production. ` +
				'Renseigne les variables requises (Supabase, clés) avant de déployer. ' +
				"On ne sert jamais de données de démonstration à de vrais utilisateurs."
		);
		this.name = 'FakeServiceError';
		this.service = service;
	}
}

/**
 * Enveloppe un service : en production, si l'implémentation n'est pas réelle,
 * toute méthode appelée lève `FakeServiceError`. En dev/build, ou si le service
 * est réel, renvoie l'implémentation telle quelle. Ne lève JAMAIS à la
 * construction — seulement à l'appel.
 */
export function guardFakeService<T extends object>(service: string, isReal: boolean, impl: T): T {
	if (!shouldRefuseFake(isProductionRuntime(), isReal)) return impl;
	return new Proxy(impl, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof value === 'function') {
				return () => {
					throw new FakeServiceError(service);
				};
			}
			return value;
		}
	});
}
