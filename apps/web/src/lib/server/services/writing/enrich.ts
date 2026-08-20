/**
 * enrich.ts — Transforme des FAITS bruts (forme, buts, confrontations lus en base)
 * en petites phrases françaises DÉTERMINISTES, et calcule « une fois sur X » à
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
import type { Market } from '$lib/types';
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
 * « une fois sur X » — arrondi de 1/proba, borné à deux au minimum (on ne présente
 * jamais une ligne trop juste comme « une fois sur une »). Renvoie null si la
 * probabilité est absente ou nulle. FORMULATION UNIQUE, langage de parieur
 * (fréquence de passage), la même que la traduction de la cote — jamais « une
 * chance sur » (langage de statisticien). C'est une APPROXIMATION grand public
 * volontaire (« une fois sur deux, pas 50,3 % ») : le pourcentage exact reste
 * affiché ailleurs dans la vue.
 */
export function chanceSur(proba: number | null): number | null {
	if (proba === null || proba <= 0) return null;
	return Math.max(2, Math.round(1 / proba));
}

export function chanceSurMot(proba: number | null): string | null {
	const x = chanceSur(proba);
	return x === null ? null : `une fois sur ${enMots(x)}`;
}

/**
 * Cote transcrite → forme d'affichage française (« 7,90 »). Deux décimales, virgule.
 * PURE mise en forme d'un nombre LU sur la capture : jamais un calcul (règle d'or
 * n°1). Utilisée par la phrase de traduction pédagogique de la cote.
 */
export function formatCote(cote: number): string {
	return cote.toFixed(2).replace('.', ',');
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
 *
 * On fait VARIER la formulation pour qu'un utilisateur qui analyse plusieurs
 * tickets dans le week-end ne lise pas trois fois la même phrase. Pas de hasard :
 * la variante est choisie de façon DÉTERMINISTE selon le contexte (nombre de
 * fragiles, contraste entre les deux probabilités), donc le même ticket donne
 * toujours le même texte.
 */
export function syntheseDeterministe(input: WritingInput): string {
	if (input.rienARetirer) return synthRienARetirer(input);
	const m = input.nbMatchs;
	const matchs = `${enMots(m)} match${m > 1 ? 's' : ''}`;
	if (input.nbFragiles <= 0) return choisir(synthNeutre(matchs, enMots(m), input.nbRetirees), input);
	return choisir(synthFragiles(matchs, input.nbFragiles), input);
}

/** Contraste renforcement/total : à quel point retirer améliore les chances. */
function contrasteBucket(input: WritingInput): number {
	const t = input.probaTotalePct;
	if (t <= 0) return 0;
	const ratio = input.probaRenforceePct / t;
	return ratio >= 2.2 ? 2 : ratio >= 1.5 ? 1 : 0;
}

/** Choix DÉTERMINISTE d'une variante selon le contexte du ticket. */
function choisir(variantes: string[], input: WritingInput): string {
	const idx = (input.nbFragiles + contrasteBucket(input) + input.nbMatchs) % variantes.length;
	return variantes[idx];
}

function synthFragiles(matchs: string, nbFragiles: number): string[] {
	const un = nbFragiles === 1;
	const fMot = enMots(nbFragiles);
	const sontFragiles = un ? 'Un seul est trop juste' : `${cap(fMot)} sont trop justes`;
	const maillons = un ? 'un maillon faible' : `${fMot} maillons faibles`;
	const neTiennent = un ? 'une ne tient pas la route' : `${fMot} ne tiennent pas la route`;
	return [
		`Ton ticket tient sur ${matchs}. ${sontFragiles}.`,
		`${cap(matchs)}, ${maillons}. Un seul suffit à tout faire tomber.`,
		`Sur tes ${matchs.replace('match', 'sélection')}, ${neTiennent}.`,
		`Ton ticket tient sur ${matchs}. ${sontFragiles}, et il suffit d'un pour tout faire tomber.`,
		`${cap(matchs)} sur ton ticket. ${sontFragiles}.`,
		`Tu joues ${matchs}. ${sontFragiles} — reste sur tes gardes.`
	];
}

/**
 * Cas « aucun badge rouge, mais un retrait » (ex. double chance) : le ticket
 * n'est PAS « tout solide » — une sélection moins fiable a été allégée, et il est
 * facturé. La synthèse doit donc reconnaître le retrait sans se contredire : ni
 * « rien à retirer » (réservé au vrai zéro retrait, gratuit), ni « aucun fragile »
 * suivi d'un retrait sec.
 */
function synthNeutre(matchs: string, mMot: string, nbRetirees: number): string[] {
	const lesMoins =
		nbRetirees <= 1 ? 'la sélection la moins solide' : 'les sélections les moins solides';
	return [
		`${cap(matchs)}. Aucun n'est vraiment risqué, mais on a allégé ${lesMoins}.`,
		`Ton ticket tient sur ${matchs}. Rien de vraiment risqué, on a juste retiré ${lesMoins}.`,
		`Sur tes ${mMot} sélections, aucune n'est vraiment risquée. On a allégé ${lesMoins}.`
	];
}

function synthRienARetirer(input: WritingInput): string {
	// Cas (c) : TOUTES les sélections sont fragiles. Alléger viderait le ticket, on ne
	// le fait pas. Ne JAMAIS dire « tient debout » — ce serait le mensonge latent
	// (ticket faible, message rassurant). On le dit honnêtement.
	if (input.toutesFragiles)
		return 'Toutes tes sélections sont trop justes. On ne peut pas alléger ce ticket sans le vider.';
	// Cas (b) : rien de fragile — le ticket tient vraiment.
	const variantes = ['Rien à retirer. Ton ticket tient debout.', 'Rien à retirer. Ton ticket est solide.'];
	return variantes[input.nbMatchs % variantes.length];
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

/**
 * Un fait candidat, avec son ORIENTATION. `buts` : le fait tire le total de buts
 * vers le haut ou le bas. `faveur` : l'équipe que le fait avantage (issue 1X2 /
 * double chance). Sert à ne retenir que les faits DÉFAVORABLES à la sélection
 * jouée — sinon le lecteur risque de lire le fait à l'envers (brief).
 */
interface FaitCandidat {
	texte: string;
	buts?: 'plus' | 'moins';
	faveur?: 'home' | 'away';
}

/** L'équipe adverse d'un camp. */
function adverse(camp: 'home' | 'away'): 'home' | 'away' {
	return camp === 'home' ? 'away' : 'home';
}

/** Fait de forme récente d'une équipe (distinctif à partir de trois matchs). */
function candForme(e: FaitsEquipe, camp: 'home' | 'away'): FaitCandidat | null {
	const n = e.forme.length;
	if (n < 3) return null;
	const v = compte(e.forme, 'V');
	const d = compte(e.forme, 'D');
	// Mauvaise forme → avantage l'adversaire ; bonne forme → avantage l'équipe.
	if (d >= 3)
		return {
			texte: `${e.nom} a perdu ${enMots(d)} de ses ${enMots(n)} derniers matchs.`,
			faveur: adverse(camp)
		};
	if (v >= 3) return { texte: `${e.nom} reste sur ${enMots(v)} victoires.`, faveur: camp };
	return null;
}

/** Faits de buts d'une équipe à domicile. */
function candButsDom(e: FaitsEquipe): FaitCandidat[] {
	const out: FaitCandidat[] = [];
	if (e.butsEncaissesDom !== null && e.butsEncaissesDom >= BEAUCOUP)
		out.push({ texte: `${e.nom} encaisse souvent à domicile.`, buts: 'plus', faveur: 'away' });
	else if (e.butsEncaissesDom !== null && e.butsEncaissesDom < PEU)
		out.push({ texte: `${e.nom} encaisse peu à domicile.`, buts: 'moins', faveur: 'home' });
	if (e.butsMarquesDom !== null && e.butsMarquesDom < PEU)
		out.push({ texte: `${e.nom} marque peu à domicile.`, buts: 'moins', faveur: 'away' });
	else if (e.butsMarquesDom !== null && e.butsMarquesDom >= BEAUCOUP)
		out.push({ texte: `${e.nom} marque beaucoup à domicile.`, buts: 'plus', faveur: 'home' });
	return out;
}

/** Faits de buts d'une équipe à l'extérieur. */
function candButsExt(e: FaitsEquipe): FaitCandidat[] {
	const out: FaitCandidat[] = [];
	if (e.butsEncaissesExt !== null && e.butsEncaissesExt >= BEAUCOUP)
		out.push({ texte: `${e.nom} encaisse souvent à l'extérieur.`, buts: 'plus', faveur: 'home' });
	else if (e.butsEncaissesExt !== null && e.butsEncaissesExt < PEU)
		out.push({ texte: `${e.nom} encaisse peu à l'extérieur.`, buts: 'moins', faveur: 'away' });
	if (e.butsMarquesExt !== null && e.butsMarquesExt < PEU)
		out.push({ texte: `${e.nom} marque peu à l'extérieur.`, buts: 'moins', faveur: 'home' });
	else if (e.butsMarquesExt !== null && e.butsMarquesExt >= BEAUCOUP)
		out.push({ texte: `${e.nom} marque beaucoup à l'extérieur.`, buts: 'plus', faveur: 'away' });
	return out;
}

/** Fait de confrontations directes (du point de vue du domicile). */
function candH2h(f: FaitsMatch): FaitCandidat | null {
	if (f.h2h.length < 2) return null;
	const v = compte(f.h2h, 'V');
	const d = compte(f.h2h, 'D');
	if (d >= 2 && d > v)
		return { texte: `${f.home.nom} a souvent perdu contre ${f.away.nom}.`, faveur: 'away' };
	if (v >= 2 && v > d)
		return { texte: `${f.home.nom} gagne souvent contre ${f.away.nom}.`, faveur: 'home' };
	return null;
}

/**
 * Un candidat est-il DÉFAVORABLE à la sélection jouée ? Seuls ces faits-là sont
 * cités : pour un « Plus de 2,5 buts » fragile, on ne garde que les faits qui
 * tirent vers MOINS de buts (ils expliquent la faiblesse). Pour « match nul » et
 * « un ou l'autre » (12), aucun fait n'a de sens clair : on n'en cite aucun.
 */
function estDefavorable(c: FaitCandidat, marche: Market): boolean {
	switch (marche) {
		case 'WIN_HOME':
		case 'DC_HOME_DRAW':
			return c.faveur === 'away';
		case 'WIN_AWAY':
		case 'DC_DRAW_AWAY':
			return c.faveur === 'home';
		case 'OVER_1_5':
		case 'OVER_2_5':
		case 'OVER_3_5':
		case 'BTTS_YES':
			return c.buts === 'moins';
		case 'UNDER_1_5':
		case 'UNDER_2_5':
		case 'UNDER_3_5':
		case 'BTTS_NO':
			return c.buts === 'plus';
		case 'DRAW':
		case 'DC_HOME_AWAY':
			return false;
	}
}

/**
 * Faits descriptifs à citer pour une sélection fragile, ORIENTÉS : uniquement
 * ceux qui jouent CONTRE la sélection jouée. Au plus trois, pour rester lisible.
 * Vide si le match est inconnu, le marché sans direction claire, ou aucun fait
 * distinctif — le rédacteur dit alors franchement qu'il n'a rien de marquant.
 */
export function faitsDescriptifs(f: FaitsMatch | undefined, marche: Market | null): string[] {
	if (!f || !marche) return [];
	const pool: FaitCandidat[] = [];
	const forme = candForme(f.home, 'home') ?? candForme(f.away, 'away');
	if (forme) pool.push(forme);
	pool.push(...candButsDom(f.home));
	pool.push(...candButsExt(f.away));
	const h2h = candH2h(f);
	if (h2h) pool.push(h2h);
	return pool
		.filter((c) => estDefavorable(c, marche))
		.map((c) => c.texte)
		.slice(0, 3);
}
