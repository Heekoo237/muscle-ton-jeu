/**
 * enrich.ts — Transforme des FAITS bruts (forme, buts, confrontations lus en base)
 * en petites phrases françaises DÉTERMINISTES, et calcule « une chance sur X » à
 * partir de la probabilité déjà calculée.
 *
 * Pourquoi construire les faits en phrases ici plutôt que passer des moyennes
 * chiffrées au modèle : le rédacteur ne doit jamais écrire un nombre qu'il a lui-
 * même formé (règle d'or n°1), ni du jargon (« 1,8 but encaissé par match »). On
 * lui donne donc « encaisse souvent à domicile », déjà en mots. Il choisit et
 * reformule, il n'invente pas.
 *
 * Les nombres qui apparaissent ici sont écrits EN TOUTES LETTRES (« deux »,
 * « trois ») : ils ne sont donc pas extraits par le garde-fou et ne dépendent
 * d'aucune liste blanche.
 */
import type { FaitsEquipe, FaitsMatch } from '$lib/server/services/stats';
import type { WritingInput } from './index';

const MOTS = [
	'zéro',
	'une',
	'deux',
	'trois',
	'quatre',
	'cinq',
	'six',
	'sept',
	'huit',
	'neuf',
	'dix'
];

/** Nombre en toutes lettres (0..10), sinon les chiffres. Forme féminine (« une »). */
export function enMots(n: number): string {
	return MOTS[n] ?? String(n);
}

/**
 * « une chance sur X » — arrondi de 1/proba, borné à deux au minimum (on ne
 * présente jamais un fragile comme « une chance sur une »). Renvoie null si la
 * probabilité est absente ou nulle. C'est une APPROXIMATION grand public
 * volontaire (« une chance sur deux, pas 50,3 % ») : le pourcentage exact reste
 * affiché ailleurs dans la vue.
 */
export function chanceSur(proba: number | null): number | null {
	if (proba === null || proba <= 0) return null;
	return Math.max(2, Math.round(1 / proba));
}

export function chanceSurMot(proba: number | null): string | null {
	const x = chanceSur(proba);
	return x === null ? null : `une chance sur ${enMots(x)}`;
}

/* ------------------------------------------------------------------------ */
/*  Synthèse déterministe (niveau 1)                                         */
/* ------------------------------------------------------------------------ */

/** Capitale initiale. */
function cap(s: string): string {
	return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * La SYNTHÈSE — une phrase sur le ticket entier — est construite par CODE, pas
 * par le modèle. Elle porte les compteurs du ticket (nombre de matchs, de
 * fragiles) : ce sont exactement les nombres qu'un modèle fabrique le plus
 * facilement (« six matchs » pour huit). Règle d'or n°1 : aucun de ces nombres
 * ne sort du LLM. Le modèle garde les explications par sélection, où il excelle.
 */
export function syntheseDeterministe(input: WritingInput): string {
	if (input.rienARetirer) return 'Rien à retirer. Ton ticket tient debout.';
	const matchs = `${enMots(input.nbMatchs)} match${input.nbMatchs > 1 ? 's' : ''}`;
	if (input.nbFragiles <= 0) {
		return `Ton ticket tient sur ${matchs}. On a allégé les sélections les moins solides.`;
	}
	const fragiles =
		input.nbFragiles === 1
			? 'Un seul est fragile'
			: `${cap(enMots(input.nbFragiles))} sont fragiles`;
	return `Ton ticket tient sur ${matchs}. ${fragiles}, et il suffit d'un pour tout faire tomber.`;
}

/* ------------------------------------------------------------------------ */
/*  Phrases de faits (qualitatives, en toutes lettres)                       */
/* ------------------------------------------------------------------------ */

/** Seuils qualitatifs sur les moyennes de buts par match. */
const PEU = 1.0;
const BEAUCOUP = 1.8;

function compte(forme: FaitsEquipe['forme'], issue: 'V' | 'N' | 'D'): number {
	return forme.filter((x) => x === issue).length;
}

/** Un fait de forme récente, s'il est distinctif (au moins trois matchs connus). */
function faitForme(e: FaitsEquipe): string | null {
	const n = e.forme.length;
	if (n < 3) return null;
	const v = compte(e.forme, 'V');
	const d = compte(e.forme, 'D');
	if (d >= 3) return `${e.nom} a perdu ${enMots(d)} de ses ${enMots(n)} derniers matchs.`;
	if (v >= 3) return `${e.nom} reste sur ${enMots(v)} victoires.`;
	return null;
}

/** Faits de buts pour une équipe reçue à domicile. */
function faitsButsDom(e: FaitsEquipe): string[] {
	const out: string[] = [];
	if (e.butsEncaissesDom !== null && e.butsEncaissesDom >= BEAUCOUP)
		out.push(`${e.nom} encaisse souvent à domicile.`);
	else if (e.butsEncaissesDom !== null && e.butsEncaissesDom < PEU)
		out.push(`${e.nom} encaisse peu à domicile.`);
	if (e.butsMarquesDom !== null && e.butsMarquesDom < PEU)
		out.push(`${e.nom} marque peu à domicile.`);
	else if (e.butsMarquesDom !== null && e.butsMarquesDom >= BEAUCOUP)
		out.push(`${e.nom} marque beaucoup à domicile.`);
	return out;
}

/** Faits de buts pour une équipe jouant à l'extérieur. */
function faitsButsExt(e: FaitsEquipe): string[] {
	const out: string[] = [];
	if (e.butsEncaissesExt !== null && e.butsEncaissesExt >= BEAUCOUP)
		out.push(`${e.nom} encaisse souvent à l'extérieur.`);
	else if (e.butsEncaissesExt !== null && e.butsEncaissesExt < PEU)
		out.push(`${e.nom} encaisse peu à l'extérieur.`);
	if (e.butsMarquesExt !== null && e.butsMarquesExt < PEU)
		out.push(`${e.nom} marque peu à l'extérieur.`);
	else if (e.butsMarquesExt !== null && e.butsMarquesExt >= BEAUCOUP)
		out.push(`${e.nom} marque beaucoup à l'extérieur.`);
	return out;
}

/** Un fait de confrontations directes, du point de vue du domicile. */
function faitH2h(f: FaitsMatch): string | null {
	if (f.h2h.length < 2) return null;
	const v = compte(f.h2h, 'V');
	const d = compte(f.h2h, 'D');
	if (d >= 2 && d > v) return `${f.home.nom} a souvent perdu contre ${f.away.nom}.`;
	if (v >= 2 && v > d) return `${f.home.nom} gagne souvent contre ${f.away.nom}.`;
	return null;
}

/**
 * Pool de faits descriptifs pour un match, prêts à être reformulés. Au plus
 * quatre : de quoi écrire deux ou trois phrases courtes sans noyer le lecteur.
 * Vide si aucun fait n'est distinctif — le rédacteur s'en tient alors au risque.
 */
export function faitsDescriptifs(f: FaitsMatch | undefined): string[] {
	if (!f) return [];
	const pool: string[] = [];
	const forme = faitForme(f.home) ?? faitForme(f.away);
	if (forme) pool.push(forme);
	pool.push(...faitsButsDom(f.home));
	pool.push(...faitsButsExt(f.away));
	const h2h = faitH2h(f);
	if (h2h) pool.push(h2h);
	return pool.slice(0, 4);
}
