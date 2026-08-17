/**
 * dbmeter.ts — Compteur de requêtes base PAR CHARGEMENT DE PAGE, avec alerte.
 *
 * Pourquoi : une boucle de requêtes (une lecture par match, un N+1) est invisible
 * à la relecture — elle a passé la revue il y a deux jours. On ne s'en remet donc
 * pas à la vigilance : on MESURE. Chaque requête base (`supabaseAdmin().from/rpc`)
 * est comptée dans un contexte par-requête (AsyncLocalStorage), et le hook serveur
 * journalise le total. Au-delà d'un SEUIL, on émet un WARN visible dans les logs
 * Vercel — même principe que la métrique de repli du rédacteur ou le taux de
 * lecture incomplète : un garde-fou chiffré, pas une bonne intention.
 *
 * Note : ne compte que les requêtes DONNÉES (service_role). Les appels Auth
 * (`getUser`) passent par un autre client et ne sont pas ici — ils sont
 * dédoublonnés à part (cache de session par requête).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface DbMeter {
	count: number;
	byTable: Record<string, number>;
}

/** Au-delà, un WARN part dans les logs : quelque chose fait trop de requêtes. */
export const DB_QUERY_WARN_THRESHOLD = 15;

/**
 * COUPE-CIRCUIT (C1) : plafond DUR, très au-dessus du baseline (~11). Une requête
 * HTTP qui dépasse ça part en boucle (N+1 emballé, amplification) — on la coupe
 * NET, avant qu'elle ne martèle la base. handleError la transforme en message
 * lisible. Ce n'est pas le seuil de WARN (15) : c'est le disjoncteur.
 */
export const DB_QUERY_HARD_CAP = 60;

/** Levée par le coupe-circuit quand une seule requête HTTP dépasse le plafond dur. */
export class DbQueryFloodError extends Error {
	constructor(count: number) {
		super(`[dbmeter] coupe-circuit : ${count} requêtes base sur une seule requête HTTP (plafond ${DB_QUERY_HARD_CAP})`);
		this.name = 'DbQueryFloodError';
	}
}

const store = new AsyncLocalStorage<DbMeter>();

/** Exécute `fn` dans un contexte de mesure neuf (un par requête HTTP). */
export function runWithDbMeter<T>(fn: () => T): T {
	return store.run({ count: 0, byTable: {} }, fn);
}

/** Incrémente le compteur de la requête courante (appelé par le client instrumenté).
 *  Lève `DbQueryFloodError` au-delà du plafond dur : la requête emballée est coupée. */
export function meterQuery(table: string): void {
	const m = store.getStore();
	if (!m) return; // hors contexte (jobs, tests) : on ne compte pas
	m.count += 1;
	m.byTable[table] = (m.byTable[table] ?? 0) + 1;
	if (m.count > DB_QUERY_HARD_CAP) throw new DbQueryFloodError(m.count);
}

/** Le relevé de la requête courante, ou null hors contexte. */
export function currentDbMeter(): DbMeter | null {
	return store.getStore() ?? null;
}
