/**
 * coherenceStore.ts — Vérification de COHÉRENCE des probabilités en base (lecture seule).
 *
 * Né du cas Rennes–PSG : un joueur voit le favori affiché à 17 %. Trois questions,
 * une réponse tirée de la DONNÉE, jamais supposée :
 *
 *  1. SOMME 1X2 — WIN_HOME + DRAW + WIN_AWAY doit valoir 1. Un écart trahit un
 *     dévigeage qui ne normalise pas (bug d'arithmétique). C'est LA question du
 *     joueur « combien de matchs ont une somme qui s'écarte de 100 % ».
 *  2. DOUBLE CHANCE — DC = somme de ses deux composantes (dérivée ou marginale).
 *     Un écart trahit une DC calculée à part, désalignée du 1X2.
 *  3. ORIENTATION — la proba et la cote doivent être MONOTONES : l'issue la plus
 *     probable a la cote la PLUS BASSE. Si WIN_HOME est donné gagnant (proba haute)
 *     alors que sa cote est la plus HAUTE, la proba est posée du mauvais côté —
 *     exactement le symptôme « le favori affiché perdant ». On le mesure en
 *     recoupant `predictions` (proba) et `odds_snapshots` (cote) du MÊME marché.
 *
 * Rien ici ne CALCULE une probabilité (règle d'or n°1) : on relit ce qui est en base
 * et on compare. La cote lue n'entre dans aucun calcul de produit — elle sert au
 * seul recoupement de cohérence, comme l'œil du joueur sur son ticket.
 */
import { isSupabaseConfigured, supabaseAdmin } from '$lib/server/supabase';
import type { Market } from '$lib/types';

// Tolérances. Le dévigeage écrit 4 décimales : l'arrondi cumulé sur 3 issues reste
// bien sous 0,005. On prend 0,02 — large, pour ne signaler que de VRAIS écarts.
const TOL_SOMME = 0.02;
// Double chance DÉRIVÉE (cote_derivee) : DC = somme EXACTE de ses composantes cotées.
// Un écart au-delà de l'arrondi trahit un bug d'arithmétique — c'est un vrai défaut.
const TOL_DC_DERIVEE = 0.02;
// Double chance MODÈLE (source « model ») : elle vient de la grille Dixon-Coles, PAS
// du 1X2 coté. Modèle et marché divergent NORMALEMENT de quelques points — ce n'est
// pas un bug. On ne parle de RETOURNEMENT que si l'écart est ÉNORME : le modèle
// (orientation du fixture) et la cote (orientation fournisseur) désignent des favoris
// opposés. 0,25 sépare franchement le désaccord modèle/marché (< 0,15) du retournement.
const SEUIL_FLIP_DC = 0.25;
// Orientation par la cote : on ne crie qu'au DÉSACCORD FRANC (proba et cote qui se
// contredisent nettement), jamais sur un quasi pile-ou-face où l'ordre n'a pas de sens.
const ECART_PROBA_MIN = 0.05; // il faut un favori proba net…
const ECART_COTE_MIN = 0.1; // …ET une cote qui dit franchement l'inverse.

const FENETRE_AVANT_MS = 14 * 86_400_000; // matchs à venir couverts
const FENETRE_APRES_MS = 7 * 86_400_000; // + une semaine passée (matchs récents)
const CAP_FIXTURES = 1200; // borne dure, signalée si atteinte (jamais de coupe muette)

interface Ligne {
	marche: Market;
	proba: number | null;
	cote: number | null;
	source: string | null;
}
export interface FixtureCoherence {
	fixtureId: number;
	dateUtc: string | null;
	home: string;
	away: string;
	winHome: number | null;
	draw: number | null;
	winAway: number | null;
	somme1x2: number | null;
	lignes: Ligne[];
}
export interface ExempleSomme {
	fixtureId: number;
	home: string;
	away: string;
	winHome: number | null;
	draw: number | null;
	winAway: number | null;
	somme: number;
}
export interface ExempleOrientation {
	fixtureId: number;
	home: string;
	away: string;
	probWinHome: number;
	coteWinHome: number;
	probWinAway: number;
	coteWinAway: number;
	commentaire: string;
}
export interface ExempleDc {
	fixtureId: number;
	home: string;
	away: string;
	dc: Market;
	valeur: number;
	attendu: number;
	ecart: number;
}
export interface ExempleFlip {
	fixtureId: number;
	home: string;
	away: string;
	dc: Market;
	dcModele: number;
	composantesCote: number;
	ecart: number;
	commentaire: string;
}
export interface CoherenceRapport {
	configured: boolean;
	fenetre: { depuis: string; jusqua: string };
	fixturesExamines: number;
	avec1x2Complet: number;
	tronque: boolean;
	// (1) 1X2 coté qui ne somme pas à 100 % — dévigeage cassé.
	sommeHors100: { n: number; tolerance: number; exemples: ExempleSomme[] };
	// (2) Double chance DÉRIVÉE (cote_derivee) ≠ somme de ses composantes — bug arithmétique.
	dcDeriveeIncoherente: { n: number; tolerance: number; exemples: ExempleDc[] };
	// (3) RETOURNEMENT : DC modèle vs 1X2 coté, favoris opposés — fixture inversé.
	flipSuspect: { n: number; seuil: number; exemples: ExempleFlip[] };
	// (4) Proba et cote qui se contredisent sur la même ligne 1X2.
	orientationSuspecte: { n: number; exemples: ExempleOrientation[] };
}

const DC_COMPOSANTES: Record<string, [Market, Market]> = {
	DC_HOME_DRAW: ['WIN_HOME', 'DRAW'],
	DC_DRAW_AWAY: ['DRAW', 'WIN_AWAY'],
	DC_HOME_AWAY: ['WIN_HOME', 'WIN_AWAY']
};

/**
 * ANOMALIES d'un seul match — fonction PURE (proba + cote + source → écarts),
 * verrouillée par test. Le store agrège ce qu'elle renvoie. On sépare le JUGEMENT
 * (ici) de l'ACCÈS BASE (le store) : c'est le jugement qu'on veut tester sans mock.
 *
 * Trois familles d'anomalies, VOLONTAIREMENT distinctes :
 *  - `sommeHors100`   : le 1X2 coté ne somme pas à 1 → dévigeage cassé (rare, grave).
 *  - `dcDerivee`      : une double chance DÉRIVÉE (cote_derivee) ≠ somme de ses cotes
 *                       → bug d'arithmétique (doit être ~0).
 *  - `flipDc`         : une double chance MODÈLE s'écarte ÉNORMÉMENT du 1X2 coté →
 *                       le modèle (orienté par le fixture) et la cote (orientée par le
 *                       fournisseur) désignent des favoris OPPOSÉS. C'est l'empreinte
 *                       du fixture retourné, détectable SANS connaître le vrai match.
 *  - `orientationCote`: proba et cote se contredisent sur la MÊME ligne (mauvais côté
 *                       posé au dévigeage). Complémentaire de `flipDc`.
 */
export interface AnomaliesFixture {
	somme1x2: number | null;
	sommeHors100: boolean;
	dcDerivee: { dc: Market; valeur: number; attendu: number; ecart: number }[];
	flipDc: { dc: Market; dcModele: number; composantesCote: number; ecart: number }[];
	orientationCote: { favProba: 'home' | 'away'; favCote: 'home' | 'away' } | null;
}
export function analyserFixture(
	proba: (m: Market) => number | null,
	cote: (m: Market) => number | null,
	source: (m: Market) => string | null
): AnomaliesFixture {
	const winHome = proba('WIN_HOME');
	const draw = proba('DRAW');
	const winAway = proba('WIN_AWAY');
	const a1x2 = winHome != null && draw != null && winAway != null;
	const somme1x2 = a1x2 ? (winHome as number) + (draw as number) + (winAway as number) : null;

	const dcDerivee: AnomaliesFixture['dcDerivee'] = [];
	const flipDc: AnomaliesFixture['flipDc'] = [];
	for (const [nom, [x, y]] of Object.entries(DC_COMPOSANTES)) {
		const v = proba(nom as Market);
		const px = proba(x);
		const py = proba(y);
		if (v == null || px == null || py == null) continue;
		const attendu = px + py;
		const ecart = Math.abs(v - attendu);
		const src = source(nom as Market);
		if (src === 'model') {
			// DC modèle vs 1X2 coté : divergence attendue, on ne signale que le RETOURNEMENT.
			if (ecart >= SEUIL_FLIP_DC) {
				flipDc.push({ dc: nom as Market, dcModele: v, composantesCote: attendu, ecart });
			}
		} else if (ecart > TOL_DC_DERIVEE) {
			// DC dérivée d'une cote : elle DOIT égaler la somme de ses composantes.
			dcDerivee.push({ dc: nom as Market, valeur: v, attendu, ecart });
		}
	}

	let orientationCote: AnomaliesFixture['orientationCote'] = null;
	const ch = cote('WIN_HOME');
	const ca = cote('WIN_AWAY');
	if (winHome != null && winAway != null && ch != null && ca != null) {
		const dProba = winHome - winAway; // > 0 : maison favorite (proba)
		const dCote = ca - ch; // > 0 : maison favorite (cote plus basse)
		if (
			Math.abs(dProba) >= ECART_PROBA_MIN &&
			Math.abs(dCote) >= ECART_COTE_MIN &&
			Math.sign(dProba) !== Math.sign(dCote)
		) {
			orientationCote = { favProba: dProba > 0 ? 'home' : 'away', favCote: dCote > 0 ? 'home' : 'away' };
		}
	}

	return {
		somme1x2,
		sommeHors100: somme1x2 != null && Math.abs(somme1x2 - 1) > TOL_SOMME,
		dcDerivee,
		flipDc,
		orientationCote
	};
}

/** Dernière valeur par (fixture, marché) : rows triées desc, on garde la 1re vue. */
function dernierParMarche<T extends { fixture_id: number; marche: Market }>(
	rows: T[]
): Map<number, Map<Market, T>> {
	const out = new Map<number, Map<Market, T>>();
	for (const r of rows) {
		const fid = Number(r.fixture_id);
		let m = out.get(fid);
		if (!m) {
			m = new Map();
			out.set(fid, m);
		}
		if (!m.has(r.marche)) m.set(r.marche, r);
	}
	return out;
}

const EMPTY: CoherenceRapport = {
	configured: false,
	fenetre: { depuis: '', jusqua: '' },
	fixturesExamines: 0,
	avec1x2Complet: 0,
	tronque: false,
	sommeHors100: { n: 0, tolerance: TOL_SOMME, exemples: [] },
	dcDeriveeIncoherente: { n: 0, tolerance: TOL_DC_DERIVEE, exemples: [] },
	flipSuspect: { n: 0, seuil: SEUIL_FLIP_DC, exemples: [] },
	orientationSuspecte: { n: 0, exemples: [] }
};

/**
 * Rapport de cohérence sur les matchs de la fenêtre. `filtreEquipe` (optionnel) :
 * ne garde que les matchs dont un nom d'équipe CONTIENT la chaîne (recherche du cas
 * précis, ex. « rennes ») — on renvoie alors le DÉTAIL complet de ces matchs.
 */
export async function computeCoherence(
	nowMs: number,
	filtreEquipe?: string
): Promise<CoherenceRapport & { detail?: FixtureCoherence[] }> {
	if (!isSupabaseConfigured()) return EMPTY;
	const sb = supabaseAdmin();
	const depuis = new Date(nowMs - FENETRE_APRES_MS).toISOString();
	const jusqua = new Date(nowMs + FENETRE_AVANT_MS).toISOString();

	// 1) Fixtures de la fenêtre (id + équipes). Bornés, tri par date décroissante.
	const { data: fxData, error: fxErr } = await sb
		.from('fixtures')
		.select('id, date_utc, team_home_id, team_away_id')
		.gte('date_utc', depuis)
		.lte('date_utc', jusqua)
		.order('date_utc', { ascending: false })
		.limit(CAP_FIXTURES + 1);
	if (fxErr) throw fxErr;
	const fxAll = (fxData ?? []) as {
		id: number;
		date_utc: string;
		team_home_id: number;
		team_away_id: number;
	}[];
	const tronque = fxAll.length > CAP_FIXTURES;
	const fx = tronque ? fxAll.slice(0, CAP_FIXTURES) : fxAll;
	if (fx.length === 0) {
		return { ...EMPTY, configured: true, fenetre: { depuis, jusqua } };
	}

	// 2) Noms d'équipes (une requête pour tous les ids référencés).
	const teamIds = [...new Set(fx.flatMap((f) => [f.team_home_id, f.team_away_id]))];
	const { data: tData, error: tErr } = await sb.from('teams').select('id, nom').in('id', teamIds);
	if (tErr) throw tErr;
	const nomDe = new Map<number, string>();
	for (const t of (tData ?? []) as { id: number; nom: string }[]) nomDe.set(Number(t.id), t.nom);

	const fixtureIds = fx.map((f) => f.id);

	// 3) Predictions (dernier jour_calcul par marché) et 4) cotes (dernière relève).
	// On lit AUSSI `source` : une DC « model » diverge normalement du 1X2 coté, une DC
	// « cote_derivee » doit l'égaler. Sans cette distinction on prend le désaccord
	// modèle/marché — normal — pour un bug (les 169 « incohérences » sur-comptées).
	const { data: pData, error: pErr } = await sb
		.from('predictions')
		.select('fixture_id, marche, probabilite, source, jour_calcul')
		.in('fixture_id', fixtureIds)
		.order('jour_calcul', { ascending: false });
	if (pErr) throw pErr;
	const predParFx = dernierParMarche(
		(
			(pData ?? []) as {
				fixture_id: number;
				marche: Market;
				probabilite: string | number;
				source: string | null;
			}[]
		).map((r) => ({ ...r, probabilite: Number(r.probabilite) }))
	);

	const { data: oData, error: oErr } = await sb
		.from('odds_snapshots')
		.select('fixture_id, marche, cote, releve_le')
		.in('fixture_id', fixtureIds)
		.order('releve_le', { ascending: false });
	if (oErr) throw oErr;
	const coteParFx = dernierParMarche(
		((oData ?? []) as { fixture_id: number; marche: Market; cote: string | number }[]).map((r) => ({
			...r,
			cote: Number(r.cote)
		}))
	);

	// 5) Recoupement par match.
	const filtre = filtreEquipe ? filtreEquipe.toLowerCase().trim() : null;
	const detail: FixtureCoherence[] = [];
	const rapport: CoherenceRapport = {
		...EMPTY,
		configured: true,
		fenetre: { depuis, jusqua },
		tronque,
		sommeHors100: { n: 0, tolerance: TOL_SOMME, exemples: [] },
		dcDeriveeIncoherente: { n: 0, tolerance: TOL_DC_DERIVEE, exemples: [] },
		flipSuspect: { n: 0, seuil: SEUIL_FLIP_DC, exemples: [] },
		orientationSuspecte: { n: 0, exemples: [] }
	};

	for (const f of fx) {
		const home = nomDe.get(Number(f.team_home_id)) ?? `#${f.team_home_id}`;
		const away = nomDe.get(Number(f.team_away_id)) ?? `#${f.team_away_id}`;
		if (filtre && !home.toLowerCase().includes(filtre) && !away.toLowerCase().includes(filtre)) {
			continue;
		}
		const preds = predParFx.get(f.id);
		const cotes = coteParFx.get(f.id);
		if (!preds) continue;
		rapport.fixturesExamines++;

		const proba = (m: Market) => preds.get(m)?.probabilite ?? null;
		const cote = (m: Market) => cotes?.get(m)?.cote ?? null;
		const source = (m: Market) => preds.get(m)?.source ?? null;
		const winHome = proba('WIN_HOME');
		const draw = proba('DRAW');
		const winAway = proba('WIN_AWAY');
		const a = analyserFixture(proba, cote, source);
		if (a.somme1x2 != null) rapport.avec1x2Complet++;

		// Détail complet quand on cible une équipe (le cas Rennes–PSG, à l'œil). La
		// SOURCE est incluse : on voit d'un coup qu'une DC « model » côtoie un 1X2 « odds ».
		if (filtre) {
			const marches = new Set<Market>([...preds.keys(), ...(cotes?.keys() ?? [])]);
			detail.push({
				fixtureId: f.id,
				dateUtc: f.date_utc ?? null,
				home,
				away,
				winHome,
				draw,
				winAway,
				somme1x2: a.somme1x2,
				lignes: [...marches].map((m) => ({ marche: m, proba: proba(m), cote: cote(m), source: source(m) }))
			});
		}

		// (1) Somme 1X2 ≠ 100 %.
		if (a.sommeHors100 && a.somme1x2 != null) {
			rapport.sommeHors100.n++;
			if (rapport.sommeHors100.exemples.length < 15) {
				rapport.sommeHors100.exemples.push({
					fixtureId: f.id, home, away, winHome, draw, winAway,
					somme: Math.round(a.somme1x2 * 1000) / 1000
				});
			}
		}

		// (2) Double chance DÉRIVÉE désalignée de ses composantes cotées.
		for (const d of a.dcDerivee) {
			rapport.dcDeriveeIncoherente.n++;
			if (rapport.dcDeriveeIncoherente.exemples.length < 15) {
				rapport.dcDeriveeIncoherente.exemples.push({
					fixtureId: f.id, home, away, dc: d.dc,
					valeur: Math.round(d.valeur * 1000) / 1000,
					attendu: Math.round(d.attendu * 1000) / 1000,
					ecart: Math.round(d.ecart * 1000) / 1000
				});
			}
		}

		// (3) RETOURNEMENT : DC modèle et 1X2 coté désignent des favoris opposés.
		for (const d of a.flipDc) {
			rapport.flipSuspect.n++;
			if (rapport.flipSuspect.exemples.length < 15) {
				rapport.flipSuspect.exemples.push({
					fixtureId: f.id, home, away, dc: d.dc,
					dcModele: Math.round(d.dcModele * 1000) / 1000,
					composantesCote: Math.round(d.composantesCote * 1000) / 1000,
					ecart: Math.round(d.ecart * 1000) / 1000,
					commentaire: `DC modèle ${(d.dcModele * 100).toFixed(0)} % vs 1X2 coté ${(d.composantesCote * 100).toFixed(0)} % — fixture probablement inversé`
				});
			}
		}

		// (4) Proba et cote se contredisent sur la même ligne 1X2.
		if (a.orientationCote) {
			rapport.orientationSuspecte.n++;
			if (rapport.orientationSuspecte.exemples.length < 15) {
				const favProba = a.orientationCote.favProba === 'home' ? home : away;
				const favCote = a.orientationCote.favCote === 'home' ? home : away;
				rapport.orientationSuspecte.exemples.push({
					fixtureId: f.id, home, away,
					probWinHome: winHome as number, coteWinHome: cote('WIN_HOME') as number,
					probWinAway: winAway as number, coteWinAway: cote('WIN_AWAY') as number,
					commentaire: `proba favorise ${favProba}, cote favorise ${favCote}`
				});
			}
		}
	}

	return filtre ? { ...rapport, detail } : rapport;
}
