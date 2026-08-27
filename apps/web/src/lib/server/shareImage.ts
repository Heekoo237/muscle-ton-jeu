/**
 * shareImage.ts — Image de partage (1080 × 1350), gabarit FIXE, rendu serveur,
 * aucune génération par IA, aucun fichier image externe. SVG autonome (polices
 * DESIGN.md embarquées) pour rester lisible réduit à 200 px (vignette WhatsApp).
 *
 * Règles de contenu (session partage) :
 *  - aucune donnée personnelle (ni prénom, ni avatar, ni email) ;
 *  - aucune cote, aucun chiffre hors les deux pourcentages ;
 *  - aucune mention de gain, de mise, de bénéfice ;
 *  - un seul élément en accent de marque : le pourcentage de droite ;
 *  - les matchs sont ceux du ticket, jamais présentés comme une recommandation.
 */
import type { StoredTicket } from './fixtures/ticketStore';
import { ANTON_B64, GEIST_B64, MONO_B64 } from './fonts.b64';
import { multiplicateurRetrait } from './domain/resultDisplay';

const CANVAS = '#F8F1E4';
const PAPER = '#FDFAF3';
const INK = '#24201B';
const INK2 = '#4A4238';
const INK3 = '#6E6357';
const OCRE = '#8C6309';
const ACCENT = '#C93A1A';
const LINE = '#C9B79A';

const ANTON = "'Anton', Impact, sans-serif";
const GEIST = "'Geist', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

export interface ShareLine {
	matchLabel: string;
	libelleFr: string;
	fragile: boolean;
	retiree: boolean;
}
export interface ShareVM {
	probaTotalePct: number;
	probaRenforceePct: number;
	/** Fractions RÉELLES (0..1, non arrondies) — SEULE base du multiplicateur (un original
	 *  affiché « 0 % » vaut en réalité 0,04 % : diviser sur l'affichage donnerait ÷0). */
	probaTotale: number;
	probaRenforcee: number;
	nbRetirees: number;
	lignes: ShareLine[]; // sélections analysables uniquement
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtPct(v: number): string {
	return `${v.toString().replace('.', ',')} %`;
}
function clip(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Construit la vue de partage depuis un ticket stocké. */
export function shareVMFromTicket(ticket: StoredTicket): ShareVM | null {
	if (!ticket.result) return null;
	const lignes: ShareLine[] = ticket.selections
		.filter((s) => s.etatResolution === 'certain')
		.map((s) => ({
			matchLabel: s.matchLabel || s.texteBrut,
			libelleFr: s.libelleFr,
			fragile: s.fragile,
			retiree: s.retireeDuRenforce
		}));
	return {
		probaTotalePct: ticket.result.probaTotalePct,
		probaRenforceePct: ticket.result.probaRenforceePct,
		probaTotale: ticket.result.probaTotale,
		probaRenforcee: ticket.result.probaRenforcee,
		nbRetirees: ticket.result.nbRetirees,
		lignes
	};
}

const FONT_STYLE = `<style>
@font-face{font-family:'Anton';src:url(data:font/woff2;base64,${ANTON_B64}) format('woff2');font-weight:400;font-display:block}
@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${GEIST_B64}) format('woff2');font-weight:400 700;font-display:block}
@font-face{font-family:'JetBrains Mono';src:url(data:font/woff2;base64,${MONO_B64}) format('woff2');font-weight:500;font-display:block}
</style>`;

/** Rangée de perforations (festons) carvée dans le papier avec la couleur du fond. */
function perf(x: number, y: number, w: number): string {
	let s = '';
	for (let cx = x; cx <= x + w + 1; cx += 22) s += `<circle cx="${cx}" cy="${y}" r="9" fill="${CANVAS}"/>`;
	return s;
}

/** Un ticket papier. `side` = 'left' | 'right'. */
function ticket(x: number, side: 'left' | 'right', vm: ShareVM): string {
	const W = 450;
	const cx = x + W / 2;
	const y0 = 215;
	const y1 = 785;
	const label = side === 'left' ? 'TON TICKET' : 'RENFORCÉ';
	const pct = side === 'left' ? vm.probaTotalePct : vm.probaRenforceePct;
	const pctColor = side === 'left' ? INK : ACCENT; // unique accent = % de droite
	const rot = side === 'left' ? -1 : 1;

	// Troncature : 4 max, fragiles prioritaires ; même sélection des deux côtés.
	const analysables = vm.lignes;
	const fragiles = analysables.filter((l) => l.fragile);
	const autres = analysables.filter((l) => !l.fragile);
	const shown = [...fragiles, ...autres].slice(0, 4);
	const reste = analysables.length - shown.length;

	const rowH = 74;
	let rows = '';
	shown.forEach((l, i) => {
		const yy = y0 + 85 + i * rowH;
		const strike = side === 'right' && l.retiree;
		const ocre = side === 'left' && l.fragile;
		// Ligne retirée : texte bien atténué, rature nette et SOMBRE, pastille
		// « RETIRÉ ». On doit voir d'un coup d'œil que des lignes ont sauté.
		const mCol = strike ? INK3 : ocre ? OCRE : INK;
		const sCol = strike ? INK3 : ocre ? OCRE : INK3;
		const match = clip(l.matchLabel, strike ? 18 : 24);
		rows += `<text x="${x + 34}" y="${yy}" font-family="${MONO}" font-weight="500" font-size="26" fill="${mCol}">${esc(match)}</text>`;
		// Marqueur « fragile » : triangle DESSINÉ (les polices sont sous-ensemblées
		// latin-fr — ▲/→ n'y sont pas et sortiraient en tofu). Vecteur = zéro glyphe.
		if (ocre) {
			const tx = x + W - 48;
			rows += `<polygon points="${tx},${yy - 22} ${tx - 10},${yy - 4} ${tx + 10},${yy - 4}" fill="${OCRE}"/>`;
		}
		rows += `<text x="${x + 34}" y="${yy + 30}" font-family="${MONO}" font-weight="500" font-size="22" fill="${sCol}">${esc(clip(l.libelleFr, 26))}</text>`;
		if (strike) {
			// Rature nette et sombre, en travers des DEUX lignes.
			rows += `<line x1="${x + 34}" y1="${yy - 8}" x2="${x + W - 34}" y2="${yy - 8}" stroke="${INK}" stroke-width="3"/>`;
			rows += `<line x1="${x + 34}" y1="${yy + 22}" x2="${x + W - 34}" y2="${yy + 22}" stroke="${INK}" stroke-width="3"/>`;
			// Pastille « RETIRÉ » à droite de la ligne.
			const tagW = 96;
			const tagX = x + W - 34 - tagW;
			const tagY = yy - 30;
			rows += `<rect x="${tagX}" y="${tagY}" width="${tagW}" height="34" rx="17" fill="${INK}"/>`;
			rows += `<text x="${tagX + tagW / 2}" y="${tagY + 24}" text-anchor="middle" font-family="${GEIST}" font-weight="700" font-size="18" letter-spacing="1" fill="${PAPER}">RETIRÉ</text>`;
		}
	});
	if (reste > 0) {
		const yy = y0 + 85 + shown.length * rowH;
		rows += `<text x="${x + 34}" y="${yy}" font-family="${MONO}" font-weight="500" font-size="22" fill="${INK3}">… et ${reste} autre${reste > 1 ? 's' : ''}</text>`;
	}

	return `<g transform="rotate(${rot} ${cx} ${(y0 + y1) / 2})">
    <text x="${cx}" y="190" text-anchor="middle" font-family="${GEIST}" font-weight="600" font-size="30" letter-spacing="2" fill="${INK3}">${label}</text>
    <rect x="${x}" y="${y0}" width="${W}" height="${y1 - y0}" rx="6" fill="${PAPER}" stroke="${LINE}" stroke-width="1"/>
    ${perf(x, y0, W)}
    ${perf(x, y1, W)}
    ${rows}
    <line x1="${x + 34}" y1="${y1 - 150}" x2="${x + W - 34}" y2="${y1 - 150}" stroke="${LINE}" stroke-width="2" stroke-dasharray="6 8"/>
    <text x="${x + 34}" y="${y1 - 100}" font-family="${GEIST}" font-weight="600" font-size="24" letter-spacing="1" fill="${INK}">TES CHANCES</text>
    <text x="${x + W - 34}" y="${y1 - 28}" text-anchor="end" font-family="${GEIST}" font-weight="600" font-size="92" letter-spacing="-3" fill="${pctColor}" style="font-feature-settings:'tnum' 1">${esc(fmtPct(pct))}</text>
  </g>`;
}

/**
 * Rendu SVG de l'image de partage. `standalone` embarque les polices (og:image,
 * rasterisation) ; sans lui, le SVG s'appuie sur les polices de la page.
 */
export function renderShareSvg(vm: ShareVM, standalone = true): string {
	const retraits =
		vm.nbRetirees <= 1 ? `${vm.nbRetirees} match retiré` : `${vm.nbRetirees} matchs retirés`;

	// Multiplicateur d'effet du retrait — MÊME calcul que l'écran de résultat
	// (resultDisplay.multiplicateurRetrait), jamais un nombre écrit à la main (règle
	// d'or n°1). N'apparaît QUE s'il y a eu un retrait ET un effet visible ; les DEUX
	// pourcentages restent toujours affichés (jamais le multiplicateur seul). Rendu en
	// INK, pas en accent : le seul accent de marque reste le % de droite (règle du
	// gabarit) — on le fait frapper par la TAILLE, pas par une seconde couleur.
	// Sur les VRAIES fractions, jamais sur les pourcentages affichés : un original arrondi
	// à « 0 % » (0,04 % réel) diviserait sinon par ~0 et masquerait le multiplicateur.
	const mult = multiplicateurRetrait(vm.probaTotale, vm.probaRenforcee, vm.nbRetirees > 0);
	const pcts = `<tspan font-weight="600" style="font-feature-settings:'tnum' 1">${esc(fmtPct(vm.probaTotalePct))}</tspan> <tspan fill="${INK3}">»</tspan> <tspan font-weight="600" style="font-feature-settings:'tnum' 1">${esc(fmtPct(vm.probaRenforceePct))}</tspan>`;
	// Sans multiplicateur : une seule ligne, comme avant. Avec : les pourcentages
	// montent d'un cran et le multiplicateur passe dessous, plus gros — c'est lui qu'on
	// retient d'un coup d'œil dans une conversation.
	const legende = mult
		? `<text x="540" y="880" text-anchor="middle" font-family="${GEIST}" font-weight="400" font-size="38" fill="${INK}">${esc(retraits)}. ${pcts}</text>
  <text x="540" y="940" text-anchor="middle" font-family="${GEIST}" font-weight="700" font-size="48" fill="${INK}">${esc(mult)}</text>`
		: `<text x="540" y="905" text-anchor="middle" font-family="${GEIST}" font-weight="400" font-size="40" fill="${INK}">${esc(retraits)}. ${pcts}</text>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  ${standalone ? FONT_STYLE : ''}
  <rect width="1080" height="1350" fill="${CANVAS}"/>

  <text x="540" y="86" text-anchor="middle" font-family="${ANTON}" font-size="42" letter-spacing="-1" fill="${INK}">MUSCLE TON JEU</text>

  ${ticket(60, 'left', vm)}
  ${ticket(570, 'right', vm)}

  ${legende}

  <line x1="90" y1="970" x2="990" y2="970" stroke="${LINE}" stroke-width="1"/>

  <text x="540" y="1075" text-anchor="middle" font-family="${GEIST}" font-weight="400" font-size="36" fill="${INK2}">Le match qui va tuer ton ticket, tu le vois avant.</text>
  <text x="540" y="1170" text-anchor="middle" font-family="${ANTON}" font-size="52" letter-spacing="-1" fill="${INK}">muscletonjeu.com</text>

  <text x="540" y="1290" text-anchor="middle" font-family="${GEIST}" font-weight="400" font-size="27" fill="${INK3}">Outil d'analyse. Pas un pronostic garanti · 18+</text>
</svg>`;
}
