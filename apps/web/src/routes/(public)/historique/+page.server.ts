import type { PageServerLoad } from './$types';

/**
 * Historique public (PRD §12). Chaque analyse est publiée et horodatée AVANT le
 * coup d'envoi, non modifiable après, ratés inclus. Deux chiffres toujours
 * ensemble : taux de réussite ET rendement à mise fixe.
 *
 * La page démarre « vide et honnête » : on ne remplit pas de contenu de démo.
 * En Session 8, `entrees` viendra d'une requête Supabase (analyses publiées).
 */
export interface EntreeHistorique {
	id: number;
	dateIso: string;
	nbMatchs: number;
	verdict: 'passe' | 'tombe' | 'en_attente';
	details: string;
}

export interface BilanPublic {
	/** Taux de réussite (0..1) — jamais affiché seul. */
	tauxReussite: number;
	/** Rendement à mise fixe (ex. 1.08 = +8 %) — toujours à côté du taux. */
	rendement: number;
}

export interface HistoriqueData {
	publieDepuisIso: string | null;
	entrees: EntreeHistorique[];
	bilan: BilanPublic | null;
}

export const load: PageServerLoad = async () => {
	// Factice : rien de publié encore → état vide et honnête (PRD §12).
	const data: HistoriqueData = {
		publieDepuisIso: null,
		entrees: [],
		bilan: null
	};
	return data;
};
