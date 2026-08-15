import type { PageServerLoad } from './$types';
import { sports } from '$lib/server/services';

/**
 * /couverture — page PUBLIQUE (sans compte) : « Quelles compétitions on analyse ? ».
 * Lue depuis le catalogue (`league_catalog` + `leagues.actif`), JAMAIS une liste en
 * dur — elle suit les coupes qui s'activent et se désactivent toutes seules.
 * Deux blocs honnêtes : « analysées finement » (backtestées) vs « d'après les cotes ».
 */
export const load: PageServerLoad = async () => {
	const all = await sports.coveredCompetitions();
	const parNom = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, 'fr');
	// Modèle : toutes les backtestées (notre socle mesuré, montré même hors-saison).
	// Cote seule : uniquement les ACTIVES (les coupes vont et viennent).
	const mesurees = all.filter((c) => c.regime === 'modele').sort(parNom);
	const coteSeule = all.filter((c) => c.regime !== 'modele' && c.actif).sort(parNom);
	return { mesurees, coteSeule };
};
