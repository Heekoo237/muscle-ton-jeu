/**
 * team-aliases.ts — Carte d'alias CURÉE pour la RÉSOLUTION du ticket.
 *
 * La capture vient d'un BOOKMAKER (Betclic : « Paris SG », « Sporting Portugal ») ;
 * la base vient d'un AUTRE référentiel, The Odds API (« Paris Saint-Germain »,
 * « Sporting Lisbon »). Deux référentiels de noms — exactement le problème
 * football-data ↔ Odds API du pipeline Python (team_aliases.py), côté app cette
 * fois.
 *
 * MÊME DISCIPLINE, non négociable :
 *  - carte EXPLICITE : chaque entrée est écrite et vérifiable à la main ;
 *  - AUCUNE fusion automatique : une variante absente reste non résolue (et
 *    JOURNALISÉE), jamais devinée ;
 *  - garde-fou anti-fusion : deux clubs distincts ne se confondent jamais — la
 *    résolution (`matchTeam`) exige une correspondance UNIQUE, un alias qui
 *    pointe vers un nom ambigu ne résout donc rien (test `team-aliases.test.ts`).
 *
 * Clé = nom bookmaker NORMALISÉ (minuscule, sans accent ni ponctuation) ;
 * valeur = nom de référence Odds API NORMALISÉ, tel qu'il apparaît en base.
 *
 * ⚠️ Provisoire : cette liste se COMPLÈTE à partir des logs `[résolution]` d'un
 * vrai ticket (nom lu + clé + candidats en base). On n'ajoute une entrée qu'après
 * avoir vu le nom exact côté base, jamais au jugé.
 */
export const TEAM_ALIASES: Record<string, string> = {
	// Betclic → The Odds API. Confirmés par les logs [résolution] d'un vrai ticket.
	'paris sg': 'paris saint germain',
	'sporting portugal': 'sporting lisbon',
	// Çorum FK, ex-Çorum Belediyespor : Betclic garde l'ancien nom, Odds API le nouveau.
	'corum belediyespor': 'corum fk',
	// Vitória SC = Vitória de Guimarães : Betclic dit « Guimaraes », Odds API « SC ».
	// La contenance par mot ne peut pas rapprocher « guimaraes » et « sc » — alias requis.
	'vitoria guimaraes': 'vitoria sc',
	// EXONYME FRANÇAIS : le bookmaker écrit « Séville », la base (Odds API) « Sevilla ».
	// « seville » et « sevilla » ne partagent aucun mot entier → alias requis. (Même
	// motif possible pour d'autres exonymes : Cologne/Köln, Naples/Napoli, etc. — on
	// n'ajoute QUE ce que les logs prouvent, jamais au jugé.)
	seville: 'sevilla',
	// EXONYME confirmé par un vrai ticket (« Inter Milan vs SSC Naples ») : le bookmaker
	// écrit « SSC Naples », la base (Odds API, Serie A) écrit « Napoli ». teamSimilarity
	// ≈ 0,31 (< seuil paire) et aucun token commun → ni matchTeam ni la paire ne
	// rattrapent : alias indispensable. UNE seule clé (ce que le log prouve) — le guard
	// anti-fusion interdit deux clés vers la même cible ; « Naples » nu s'ajoutera si un
	// ticket le montre.
	'ssc naples': 'napoli'
};

/** Nom de référence pour une clé bookmaker normalisée, ou la clé inchangée. */
export function aliasFor(normalizedName: string): string {
	return TEAM_ALIASES[normalizedName] ?? normalizedName;
}
