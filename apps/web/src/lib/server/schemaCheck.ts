/**
 * schemaCheck.ts — Détecte le DÉCALAGE entre le code déployé et le schéma en base.
 *
 * Le code attend des tables/colonnes/fonctions ; si une migration n'a pas été
 * appliquée, la base ne les a pas et une page connectée tombe en 500 — découvert
 * par l'utilisateur, pas par nous. Ici on VÉRIFIE, on ne suppose pas.
 *
 * Source de vérité UNIQUE : packages/db/schema_manifest.json (importé, inliné au
 * build). Le moteur d'introspection est la fonction SQL `verifier_schema` (migration
 * 0019) — l'app parle à la base via PostgREST, qui n'expose ni information_schema ni
 * pg_proc, d'où l'encapsulation en base. La MÊME fonction et le MÊME manifeste
 * alimentent la surveillance Python (health.py → email 6 h).
 */
import { supabaseAdmin } from '$lib/server/supabase';
import manifest from '../../../../../packages/db/schema_manifest.json';

export interface SchemaCheck {
	ok: boolean;
	/** Objets manquants, lisibles : « users.analyses_offertes_utilisees (migration 0014) ». */
	manquants: string[];
	/** Vrai si le moteur `verifier_schema` lui-même est absent (0019 non appliquée). */
	moteurAbsent?: boolean;
}

/** Le manifeste, tel qu'exposé pour information (endpoint de diagnostic). */
export const SCHEMA_MANIFEST = manifest as Record<string, unknown>;

/**
 * Compare le manifeste au schéma réel via `verifier_schema`. Renvoie la liste des
 * objets manquants (vide = base alignée). Si `verifier_schema` est absente, on le
 * signale explicitement plutôt que de prétendre que tout va bien.
 */
export async function checkSchema(): Promise<SchemaCheck> {
	const { data, error } = await supabaseAdmin().rpc('verifier_schema', { p_manifest: manifest });
	if (error) {
		// 42883 = undefined_function : le moteur n'est pas installé (0019 non appliquée).
		const moteurAbsent = error.code === '42883' || /verifier_schema/.test(error.message ?? '');
		return {
			ok: false,
			moteurAbsent,
			manquants: moteurAbsent
				? ['fonction verifier_schema (migration 0019) — surveillance de schéma inactive']
				: [`échec de la vérification de schéma : ${error.message}`]
		};
	}
	const rows = (data ?? []) as { objet: string; migration: string }[];
	return {
		ok: rows.length === 0,
		manquants: rows.map((r) => `${r.objet} (migration ${r.migration})`)
	};
}
