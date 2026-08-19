/**
 * publicHistory.ts — Historique public : la DÉTECTION et l'EFFET DU RETRAIT, avec les
 * cotes. Module D'AFFICHAGE (pas d'analyse). Décision arrêtée (CLAUDE.md) : JAMAIS un
 * taux de réussite de pari — on montre la BASCULE (un ticket perdu tel quel, gagnant
 * après retrait), et on garde les échecs visibles.
 *
 * POURQUOI LA COTE COMBINÉE NE VIOLE PAS LA RÈGLE D'OR N°1 : c'est le PRODUIT de cotes
 * TRANSCRITES (des faits lus sur la capture), affiché À CÔTÉ des cotes individuelles —
 * une cote mal lue est donc visible et contestable, pas une probabilité inventée
 * invisible. Ce n'est pas une proba, ce n'est pas un gain (aucune mise), et ça
 * n'influence JAMAIS quelle ligne est gardée (la fragilité décide, sans cote). La
 * cote reste INTERDITE dans `ticket.ts` et `settle.ts` (garde `no-cote-in-calc`) ;
 * elle n'est légitime QUE dans ce module d'affichage.
 */
import type { TicketResult } from '$lib/types';

/** Le plancher : rien ne s'affiche sous ce nombre de tickets RÉGLÉS (les deux verdicts). */
export const PLANCHER_TICKETS = 20;

/** Nombre d'exemples affichés en tête (dont TOUJOURS au moins un échec). */
export const NB_EXEMPLES = 4;

/** Fenêtre (jours) où puiser un échec quand le jour n'en a aucun — jamais une vitrine. */
export const FENETRE_ECHEC_JOURS = 7;

/**
 * Effet du retrait sur un ticket réglé, comparé au ticket original :
 *  - `sauve`           : perdu tel quel, gagnant après retrait (LE message) ;
 *  - `tombe_malgre`    : tombé même après retrait (l'échec, jamais caché) ;
 *  - `passe_quand_meme`: passait déjà, le retrait n'a rien changé (honnêteté).
 * `null` si le ticket n'est pas classable (en attente, ou incohérent).
 */
export type Bascule = 'sauve' | 'tombe_malgre' | 'passe_quand_meme';

export function classer(originale: TicketResult, renforce: TicketResult): Bascule | null {
	if (originale === 'tombe' && renforce === 'passe') return 'sauve';
	if (renforce === 'tombe') return 'tombe_malgre'; // ⇒ originale = tombe (renforcé ⊆ original)
	if (originale === 'passe' && renforce === 'passe') return 'passe_quand_meme';
	return null; // en_attente, ou (passe → tombe) impossible par construction
}

export interface LignePublique {
	matchLabel: string;
	libelleFr: string;
	/** Cote TRANSCRITE de la capture (fait, jamais recalculé). null si non lue. */
	cote: number | null;
	retiree: boolean;
	/** Sort réglé de la ligne : true = tombée, false = passée, null = non réglable. */
	tombe: boolean | null;
}

export interface TicketPublic {
	id: number;
	analyseLeMs: number;
	bascule: Bascule;
	lignes: LignePublique[];
	/** Produit des cotes des lignes GARDÉES (fait affiché). null si une cote manque. */
	coteCombinee: number | null;
}

/**
 * Cote combinée = PRODUIT des cotes des lignes gardées (non retirées). Fait affiché,
 * jamais une probabilité. `null` si une cote manque ou est aberrante — on n'invente
 * jamais un nombre (règle d'or n°1).
 */
export function coteCombinee(lignes: LignePublique[]): number | null {
	const gardees = lignes.filter((l) => !l.retiree);
	if (gardees.length === 0) return null;
	let p = 1;
	for (const l of gardees) {
		if (l.cote == null || !(l.cote > 1)) return null;
		p *= l.cote;
	}
	return Math.round(p * 100) / 100;
}

/** Tri DÉTERMINISTE : cote combinée décroissante (le plus « difficile » d'abord —
 *  ce qui parle aux chasseurs de cotes), départage stable par id. */
function parCoteDesc(a: TicketPublic, b: TicketPublic): number {
	return (b.coteCombinee ?? 0) - (a.coteCombinee ?? 0) || a.id - b.id;
}

/**
 * Choisit les exemples à mettre en tête, DÉTERMINISTE pour la journée :
 *  - TOUJOURS un échec (`tombe_malgre`) : du jour, sinon du `poolEchec` (7 j) —
 *    sinon la page redeviendrait une vitrine ;
 *  - puis les meilleures « sauves » (cote combinée décroissante) ;
 *  - puis éventuellement un « passe quand même ».
 * L'ensemble final est trié par cote décroissante pour l'affichage. Jamais de hasard.
 */
export function choisirExemples(duJour: TicketPublic[], poolEchec: TicketPublic[]): TicketPublic[] {
	const sauves = duJour.filter((t) => t.bascule === 'sauve').sort(parCoteDesc);
	const echecsJour = duJour.filter((t) => t.bascule === 'tombe_malgre').sort(parCoteDesc);
	const passe = duJour.filter((t) => t.bascule === 'passe_quand_meme').sort(parCoteDesc);
	const echec =
		echecsJour[0] ??
		poolEchec.filter((t) => t.bascule === 'tombe_malgre').sort(parCoteDesc)[0] ??
		null;

	const choisis: TicketPublic[] = [];
	const vus = new Set<number>();
	const ajouter = (t: TicketPublic | null | undefined) => {
		if (t && !vus.has(t.id) && choisis.length < NB_EXEMPLES) {
			vus.add(t.id);
			choisis.push(t);
		}
	};
	ajouter(echec); // l'échec obligatoire d'abord (jamais évincé par le cap)
	for (const t of sauves) ajouter(t);
	ajouter(passe[0]);
	return choisis.sort(parCoteDesc);
}

const JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Parties calendaires LOCALES d'un instant (offset fixe Afrique Ouest/Centrale). */
function local(ms: number, offsetMs: number) {
	const d = new Date(ms + offsetMs);
	return {
		jour: `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`,
		dow: d.getUTCDay(),
		date: d.getUTCDate(),
		h: d.getUTCHours(),
		min: d.getUTCMinutes()
	};
}

/**
 * Libellé ANONYME et daté d'un ticket. Aujourd'hui → « 21h40 » ; hier → « Hier,
 * 21h40 » ; au-delà → « Samedi 16, 21h40 ». Jamais de nom ni d'identifiant : sur ce
 * marché, montrer QUI parie est un vrai risque pour la personne.
 */
export function libelleDate(analyseLeMs: number, nowMs: number, offsetMs: number): string {
	const t = local(analyseLeMs, offsetMs);
	const n = local(nowMs, offsetMs);
	const heure = `${t.h}h${String(t.min).padStart(2, '0')}`;
	if (t.jour === n.jour) return heure;
	const hier = local(nowMs - 86_400_000, offsetMs);
	if (t.jour === hier.jour) return `Hier, ${heure}`;
	const nomJour = JOURS_FR[t.dow];
	return `${nomJour[0].toUpperCase()}${nomJour.slice(1)} ${t.date}, ${heure}`;
}
