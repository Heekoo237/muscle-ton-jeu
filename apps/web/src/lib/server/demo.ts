/**
 * demo.ts — Données FICTIVES de démonstration (phase convention).
 *
 * Objectif : rendre les interfaces dynamiques pour voir leur comportement
 * (bandeau animé, historique, statistiques) tant que le pipeline n'alimente pas
 * encore la base. Rien ici n'est réel.
 *
 * ⚠️ TEMPORAIRE — jamais de démo servie à un vrai utilisateur.
 *
 * Le mode démo est piloté par `PUBLIC_DEMO_MODE`. Par SÉCURITÉ, il est DÉSACTIVÉ
 * par défaut : seule la valeur exacte « true » l'active. Une variable oubliée,
 * vide ou mal orthographiée laisse la démo ÉTEINTE — on ne compte jamais sur une
 * config correcte pour éviter de servir du factice (même logique que le garde-fou
 * anti-factice). Quand il est actif, un bandeau visible le signale à l'écran.
 *
 * Les règles d'or tiennent quand même : aucun nom de personne, aucune promesse
 * de gain, les résultats défavorables à nos analyses sont montrés aussi.
 */
import type { ExplicationVM, HistoryItem, LineVM } from '$lib/types';
import { env } from '$env/dynamic/public';

/**
 * Règle de sécurité (testable) : SEULE la valeur exacte « true » active la démo.
 * Absent, vide, « false », « 1 », « yes »… → ÉTEINT. Une variable oubliée ne
 * rallume jamais la démo.
 */
export function demoEnabled(raw: string | undefined): boolean {
	return (raw ?? '').trim().toLowerCase() === 'true';
}

export const DEMO_MODE = demoEnabled(env.PUBLIC_DEMO_MODE);

/* ---- Bandeau d'historique (≥ 20 pour s'afficher) ---- */
export function demoHistoryItems(): HistoryItem[] {
	// fragile+TOMBÉ / solide+PASSÉ = nos appels justes ; fragile+PASSÉ /
	// solide+TOMBÉ = nos appels ratés, montrés sans filtre.
	return [
		{ matchLabel: 'LENS – NICE', fragile: true, passe: false },
		{ matchLabel: 'REAL – SEVILLA', fragile: false, passe: true },
		{ matchLabel: 'MILAN – TORINO', fragile: true, passe: false },
		{ matchLabel: 'LYON – RENNES', fragile: false, passe: true },
		{ matchLabel: 'PORTO – BRAGA', fragile: true, passe: true },
		{ matchLabel: 'AJAX – FEYENOORD', fragile: false, passe: false },
		{ matchLabel: 'CELTIC – RANGERS', fragile: true, passe: false },
		{ matchLabel: 'BENFICA – SPORTING', fragile: false, passe: true },
		{ matchLabel: 'NAPOLI – ROMA', fragile: true, passe: false },
		{ matchLabel: 'DORTMUND – LEIPZIG', fragile: false, passe: true },
		{ matchLabel: 'VILLARREAL – BETIS', fragile: true, passe: true },
		{ matchLabel: 'MONACO – LILLE', fragile: false, passe: true },
		{ matchLabel: 'ATALANTA – FIORENTINA', fragile: true, passe: false },
		{ matchLabel: 'VALENCIA – OSASUNA', fragile: false, passe: false },
		{ matchLabel: 'WOLFSBURG – MAINZ', fragile: true, passe: false },
		{ matchLabel: 'NANTES – BREST', fragile: false, passe: true },
		{ matchLabel: 'SEVILLA – GETAFE', fragile: true, passe: true },
		{ matchLabel: 'LAZIO – UDINESE', fragile: false, passe: true },
		{ matchLabel: 'PSV – AZ ALKMAAR', fragile: true, passe: false },
		{ matchLabel: 'FRANKFURT – KÖLN', fragile: false, passe: true },
		{ matchLabel: 'TWENTE – UTRECHT', fragile: true, passe: false },
		{ matchLabel: 'BOLOGNA – GENOA', fragile: false, passe: true }
	];
}

/* ---- Statistiques d'accueil ---- */
export function demoStats() {
	return {
		ticketsAnalyses: 18,
		fragilesMarques: 47,
		fragilesTombes: 31,
		ticketsRegles: 12,
		ticketsEnAttente: 6
	};
}

/* ---- Tickets en cours (matchs à venir) ---- */
export interface DemoEnCours {
	id: string;
	dateMs: number;
	nbMatchs: number;
	kickoffMs: number;
}
export function demoTicketsEnCours(nowMs: number): DemoEnCours[] {
	const h = 3600 * 1000;
	return [
		{ id: 'demo-a', dateMs: nowMs - 2 * h, nbMatchs: 6, kickoffMs: nowMs + 5 * h },
		{ id: 'demo-b', dateMs: nowMs - 26 * h, nbMatchs: 9, kickoffMs: nowMs + 20 * h }
	];
}

/* ---- Historique : lignes de liste ---- */
export interface DemoHistoLine {
	id: string;
	dateMs: number;
	nbMatchs: number;
	nbFragiles: number;
	statut: 'attente' | 'passe' | 'tombe' | 'sans_reglement' | 'indisponible';
	kickoffMs: number | null;
	verdictDateMs: number | null;
	tombeSur: string | null;
	verdictRenforce: boolean;
}
export function demoHistoLignes(nowMs: number): DemoHistoLine[] {
	const d = 24 * 3600 * 1000;
	return [
		{ id: 'demo-a', dateMs: nowMs - 2 * 3600 * 1000, nbMatchs: 6, nbFragiles: 2, statut: 'attente', kickoffMs: nowMs + 5 * 3600 * 1000, verdictDateMs: null, tombeSur: null, verdictRenforce: false },
		{ id: 'demo-b', dateMs: nowMs - 26 * 3600 * 1000, nbMatchs: 9, nbFragiles: 3, statut: 'attente', kickoffMs: nowMs + 20 * 3600 * 1000, verdictDateMs: null, tombeSur: null, verdictRenforce: false },
		{ id: 'demo-1', dateMs: nowMs - 2 * d, nbMatchs: 7, nbFragiles: 2, statut: 'tombe', kickoffMs: null, verdictDateMs: nowMs - 2 * d + 3 * 3600 * 1000, tombeSur: 'LENS – NICE', verdictRenforce: true },
		{ id: 'demo-2', dateMs: nowMs - 4 * d, nbMatchs: 5, nbFragiles: 1, statut: 'passe', kickoffMs: null, verdictDateMs: nowMs - 4 * d + 3 * 3600 * 1000, tombeSur: null, verdictRenforce: false },
		{ id: 'demo-3', dateMs: nowMs - 6 * d, nbMatchs: 9, nbFragiles: 3, statut: 'tombe', kickoffMs: null, verdictDateMs: nowMs - 6 * d + 3 * 3600 * 1000, tombeSur: 'AJAX – FEYENOORD', verdictRenforce: false },
		{ id: 'demo-4', dateMs: nowMs - 9 * d, nbMatchs: 4, nbFragiles: 0, statut: 'passe', kickoffMs: null, verdictDateMs: nowMs - 9 * d + 3 * 3600 * 1000, tombeSur: null, verdictRenforce: false }
	];
}

/* ---- Détail d'un ticket de démonstration (lecture seule) ---- */
export interface DemoDetail {
	dateMs: number;
	nbMatchs: number;
	lignes: LineVM[];
	probaTotalePct: number;
	probaRenforceePct: number;
	nbRetirees: number;
	synthese: string | null;
	explications: ExplicationVM[];
	verdict: 'attente' | 'passe' | 'tombe';
	tombeSur: string | null;
	verdictRenforce: boolean;
	issues: Record<number, 'passe' | 'tombe' | 'attente'>;
}

function line(
	ordre: number,
	matchLabel: string,
	libelleFr: string,
	cote: number,
	probabilitePct: number,
	fragile = false,
	retiree = false
): LineVM {
	return {
		ordre,
		index: String(ordre).padStart(2, '0'),
		matchLabel,
		libelleFr,
		cote,
		fragile,
		retiree,
		mentionNeutre: retiree && !fragile,
		serree: false,
		analysable: true,
		probabilitePct
	};
}

export function demoTicketDetail(id: string, nowMs: number): DemoDetail {
	// Un détail soigné, réutilisé pour tout ticket de démonstration.
	const lignes: LineVM[] = [
		line(1, 'REAL – SEVILLA', 'Real gagne', 1.55, 63),
		line(2, 'LENS – NICE', 'Plus de 2,5 buts', 1.95, 41, true, true),
		line(3, 'LYON – RENNES', 'Les deux marquent', 1.72, 55),
		line(4, 'MILAN – TORINO', 'Milan gagne', 2.1, 38, false, true), // 1X2 : badge retiré (intérim), mention neutre
		line(5, 'PORTO – BRAGA', 'Porto ou match nul', 1.28, 74),
		line(6, 'BENFICA – SPORTING', 'Moins de 3,5 buts', 1.4, 68),
		line(7, 'MONACO – LILLE', 'Double chance Monaco', 1.33, 71)
	];
	const known = id === 'demo-a' || id === 'demo-b';
	return {
		dateMs: nowMs - (known ? 2 * 3600 * 1000 : 2 * 24 * 3600 * 1000),
		nbMatchs: lignes.length,
		lignes,
		probaTotalePct: 4.2,
		probaRenforceePct: 12.6,
		nbRetirees: 2,
		synthese: 'Ton ticket tient sur sept matchs. Un est trop juste, une autre ligne allégée.',
		explications: [
			{
				ordre: 2,
				matchLabel: 'LENS – NICE',
				libelleFr: 'Plus de 2,5 buts',
				avecBadge: true,
				texte:
					'Plus de 2,5 buts, c’est risqué. Lens marque peu à domicile, et Nice ferme bien le jeu. Une fois sur deux, pas plus.',
				autresIssues: [
					{ libelleFr: 'Moins de 2,5 buts', probabilitePct: 53 },
					{ libelleFr: 'Match nul', probabilitePct: 30 }
				],
				chancesCotes: false
			},
			{
				ordre: 4,
				matchLabel: 'MILAN – TORINO',
				libelleFr: 'Milan gagne',
				avecBadge: false,
				texte:
					'Milan gagne, c’est la moins solide de ton ticket. Milan a perdu deux fois à domicile ce mois-ci. Une fois sur trois, pas plus.',
				autresIssues: [
					{ libelleFr: 'Torino gagne', probabilitePct: 34 },
					{ libelleFr: 'Match nul', probabilitePct: 28 }
				],
				chancesCotes: false
			}
		],
		// Démo réglée pour montrer le verdict (les deux fragiles retirés tombent → le
		// renforcé serait passé) ; les autres restent en attente.
		verdict: known ? 'tombe' : 'attente',
		tombeSur: known ? 'LENS – NICE' : null,
		verdictRenforce: known,
		issues: known
			? { 1: 'passe', 2: 'tombe', 3: 'passe', 4: 'tombe', 5: 'passe', 6: 'passe', 7: 'passe' }
			: { 1: 'attente', 2: 'attente', 3: 'attente', 4: 'attente', 5: 'attente', 6: 'attente', 7: 'attente' }
	};
}

export function isDemoId(id: string): boolean {
	return id.startsWith('demo-');
}
