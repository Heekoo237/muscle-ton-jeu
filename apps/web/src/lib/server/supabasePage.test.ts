/**
 * supabasePage.test.ts — GARDE-FOU anti-troncature (la leçon des « 1000 lignes »).
 *
 * PostgREST plafonne toute réponse au « Max Rows » du projet (1000 par défaut) SANS
 * lever d'erreur — et `.limit(50000)` n'y change rien. Une lecture de collection qui
 * ne pagine pas et peut dépasser 1000 lignes est donc un bug silencieux (une équipe qui
 * disparaît, un règlement calculé sur 1000 tickets au lieu de tous).
 *
 * RÈGLE (CLAUDE.md) : toute requête qui lit une COLLECTION doit PAGINER (`selectAll`)
 * ou PROUVER qu'elle reste sous le plafond. Ce test scanne le code serveur et échoue
 * si une lecture `.from(x).select(...)` n'est ni paginée, ni bornée, ni inscrite dans
 * l'allowlist ci-dessous AVEC sa preuve. Une lecture est BORNÉE si elle porte
 * `.single()` / `.maybeSingle()`, un `count … head:true`, ou un `.limit(N)` avec
 * N ≤ 1000. Sinon : `selectAll(...)`, ou une ligne d'allowlist qui dit pourquoi.
 *
 * L'allowlist EST l'audit : chaque entrée est une preuve de borne, ou un diagnostic
 * explicitement toléré. Ajouter une lecture non bornée sans y penser fait ÉCHOUER le
 * test — l'oubli devient bruyant, au lieu de se découvrir en production.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..'); // apps/web/src
const ROOTS = [join(SRC, 'lib', 'server'), join(SRC, 'routes')];

/**
 * Lectures NON paginées mais PROUVÉES bornées (ou diagnostics tolérés). Clé =
 * `<fichier relatif à src>::<table>`. Valeur = la preuve. À maintenir en conscience.
 */
const ALLOWLIST: Record<string, string> = {
	// — Bornées par UNE entité (un ticket, un utilisateur, un fixture) —
	'lib/server/fixtures/ticketStore.ts::tickets': "un seul ticket (.eq id) ou un seul utilisateur (.eq user_id)",
	'lib/server/fixtures/ticketStore.ts::selections': "les lignes d'UN seul ticket (.eq ticket_id) — quelques dizaines",
	'lib/server/services/predictions/supabase.ts::predictions': "les marchés d'un ou quelques fixtures d'un ticket (.eq/.in fixture_id)",
	'lib/server/services/notifications/webpush.ts::push_subscriptions': "les abonnements d'UN utilisateur (.eq user_id)",
	'lib/server/services/stats/supabase.ts::fixtures': "bornée par les équipes d'un ticket (.in id / .or team_id)",
	'lib/server/services/stats/supabase.ts::teams': "les équipes d'un ticket (.in id) — quelques-unes",
	'lib/server/services/sports/supabase.ts::fixtures': "fixtureDates : bornée par les fixtures réglables d'un utilisateur (.in id) — les balayages larges sont paginés (selectAll)",
	'lib/server/services/sports/supabase.ts::leagues': "table de référence ~50-100 lignes (coveredCompetitions)",
	'lib/server/services/sports/supabase.ts::league_catalog': "table de référence ~50 lignes (coveredCompetitions)",
	'lib/server/notifRunner.ts::notifications_sent': "borné par le lot de tickets à régler (≤ 500)",
	'lib/server/notifRunner.ts::push_subscriptions': "borné par les utilisateurs actifs (.in) — à découper si ça dépasse un jour",
	'lib/server/notifRunner.ts::fixtures': "les fixtures d'un lot de tickets (.in id) / count head",
	'lib/server/notifRunner.ts::predictions': "les marchés d'un lot de fixtures (.in fixture_id)",
	'lib/server/notifRunner.ts::users': "bornée par les utilisateurs éligibles (.in id)",
	'lib/server/fixtures/historyStore.ts::teams': "les équipes des 200 derniers matchs terminés (.in id ≤ 400)",
	'lib/server/fixtures/historyStore.ts::selections': "borné par .limit(limit*4) (≤ 160) et .in(fixture_id) des 200 derniers matchs",
	'lib/server/odds/ondemand.ts::fixtures': "les fixtures non résolus d'UN ticket (.in id) / .limit(1)",
	'lib/server/odds/ondemand.ts::leagues': "les ligues d'un ticket (.in id) — quelques-unes",
	'lib/server/odds/ondemand.ts::league_catalog': "les fd_codes d'un ticket (.in fd_code) — quelques-uns",
	'lib/server/fixtures/detectionStore.ts::tickets': "DIAGNOSTIC /api/health/detection — best-effort",
	'lib/server/fixtures/detectionStore.ts::selections': "DIAGNOSTIC — borné par les fixtures terminés (.in)",
	// — Diagnostics MANUELS (workflow / health), non paginés, tolérés best-effort —
	'lib/server/fixtures/reglementDiag.ts::tickets': "DIAGNOSTIC manuel /reglement — best-effort, à paginer si le volume en attente explose",
	'lib/server/fixtures/reglementDiag.ts::fixtures': "DIAGNOSTIC manuel — borné par le lot diagnostiqué (.in)",
	'lib/server/fixtures/reglementDiag.ts::selections': "DIAGNOSTIC manuel — borné par le lot (.in)",
	'lib/server/fixtures/reglementDiag.ts::teams': "DIAGNOSTIC manuel — borné par le lot (.in)",
	'lib/server/fixtures/reglementDiag.ts::leagues': "DIAGNOSTIC manuel — borné par le lot (.in)",
	'lib/server/fixtures/reglementDiag.ts::league_catalog': "DIAGNOSTIC manuel — borné par le lot (.in)",
	'lib/server/fixtures/coherenceStore.ts::fixtures': "DIAGNOSTIC /api/health/coherence — fenêtre bornée, best-effort",
	'lib/server/fixtures/coherenceStore.ts::predictions': "DIAGNOSTIC — borné par les fixtures de la fenêtre (.in)",
	'lib/server/fixtures/coherenceStore.ts::odds_snapshots': "DIAGNOSTIC — borné par les fixtures de la fenêtre (.in)",
	'lib/server/fixtures/coherenceStore.ts::teams': "DIAGNOSTIC — borné par les équipes de la fenêtre (.in)",
	'lib/server/fixtures/coherenceStore.ts::selections': "DIAGNOSTIC — borné par les fixtures retournés (.in)",
	'lib/server/fixtures/detectionStore.ts::fixtures': "DIAGNOSTIC /api/health/detection — best-effort, à paginer si volume"
};

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		const s = statSync(p);
		if (s.isDirectory()) out.push(...walk(p));
		else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.spec.ts')) out.push(p);
	}
	return out;
}

/** Une lecture est-elle BORNÉE par sa forme (indépendamment de l'allowlist) ? */
function estBornee(stmt: string): boolean {
	if (/\.single\s*\(/.test(stmt) || /\.maybeSingle\s*\(/.test(stmt)) return true;
	if (/count\s*:/.test(stmt) && /head\s*:\s*true/.test(stmt)) return true;
	const lim = stmt.match(/\.limit\s*\(\s*(\d+)\s*\)/);
	if (lim && Number(lim[1]) <= 1000) return true;
	return false;
}

describe('lectures Supabase — pagination ou borne prouvée (anti-troncature 1000 lignes)', () => {
	it('aucune lecture de collection non paginée sans preuve', () => {
		const violations: string[] = [];
		for (const root of ROOTS) {
			for (const file of walk(root)) {
				const code = readFileSync(file, 'utf-8');
				const rel = relative(SRC, file).split('\\').join('/');
				const re = /\.from\(\s*['"](\w+)['"]\s*\)/g;
				let m: RegExpExecArray | null;
				while ((m = re.exec(code))) {
					const table = m[1];
					const start = m.index;
					const stmt = code.slice(start, start + 900); // la requête chaînée jusqu'au ;
					if (!/^\s*\.from\([^)]*\)\s*\.select\s*\(/.test(code.slice(start).replace(/\n/g, ' ').slice(0, 200)))
						continue; // pas un .select (insert/update/delete/upsert) → pas une lecture
					const before = code.slice(Math.max(0, start - 240), start);
					if (/selectAll\s*[<(]/.test(before)) continue; // paginé (selectAll, générique compris)
					if (estBornee(stmt)) continue; // borné par sa forme
					const key = `${rel}::${table}`;
					if (key in ALLOWLIST) continue; // borne prouvée / diagnostic toléré
					violations.push(key);
				}
			}
		}
		expect(violations, `Lecture(s) de collection non paginée(s) et non prouvée(s) :\n  ${[...new Set(violations)].join('\n  ')}\n→ enveloppe dans selectAll(), OU ajoute une preuve à ALLOWLIST.`).toEqual([]);
	});
});
