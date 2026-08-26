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
	'vitoria guimaraes': 'vitoria sc'
	// Les EXONYMES (Séville→Sevilla, Naples→Napoli) sont traités par token plus bas, PAS ici.
};

/**
 * EXONYMES — traduction d'un MOT de nom propre, appliquée TOKEN par TOKEN.
 *
 * Un exonyme (« Séville » pour Sevilla, « Naples » pour Napoli) est le MÊME club sous
 * un nom traduit ; il apparaît sous plusieurs habillages selon le bookmaker et la
 * vision (« Naples », « SSC Naples », « FC Naples »…). Le mettre dans TEAM_ALIASES
 * imposerait une entrée par habillage — et se heurterait au garde-fou anti-fusion, qui
 * interdit deux clés (« naples », « ssc naples ») pointant vers la même cible « napoli ».
 *
 * On traduit donc le TOKEN, une fois, et il mord quel que soit l'habillage. Contrainte
 * de sûreté : la clé doit être un mot qui NE désigne QUE ce club (pas un mot générique
 * comme « fc » ou « united »), sinon on renommerait à tort. « naples »/« seville » sont
 * des noms propres de ville non ambigus dans notre univers de couverture.
 *
 * Terrain (2026-08) : la vision renvoyait tantôt « SSC Naples », tantôt « Naples » nu —
 * l'alias plein « ssc naples » ne mordait que la première forme, d'où un « championnat
 * non couvert » INTERMITTENT sur l'Inter–Napoli. La traduction par token supprime
 * l'intermittence : toute forme contenant « naples » devient « napoli ».
 */
const EXONYMES: Record<string, string> = {
	// « Séville » (bookmaker/vision FR) → « Sevilla » (base, Odds API).
	seville: 'sevilla',
	// « Naples » (bookmaker/vision FR, seul ou dans « SSC Naples ») → « Napoli » (base).
	naples: 'napoli'
};

/**
 * Nom de référence pour un nom bookmaker normalisé, ou le nom inchangé.
 *
 * Deux étages : (1) on traduit chaque TOKEN via EXONYMES (« ssc naples » → « ssc napoli »,
 * « naples » → « napoli »), puis (2) on applique la carte plein-nom TEAM_ALIASES sur le
 * résultat. Une entrée plein-nom l'emporte donc toujours sur la somme des tokens.
 */
export function aliasFor(normalizedName: string): string {
	const traduit = normalizedName
		.split(' ')
		.map((token) => EXONYMES[token] ?? token)
		.join(' ');
	return TEAM_ALIASES[traduit] ?? traduit;
}
