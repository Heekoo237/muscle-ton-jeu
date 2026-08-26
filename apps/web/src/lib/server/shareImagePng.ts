/**
 * shareImagePng.ts — Rasterisation SERVEUR de l'image de partage en PNG (resvg),
 * polices DESIGN.md embarquées (TTF). Cible < 300 ms, résultat mis en cache.
 *
 * Isolé du rendu SVG : ce module charge le binaire natif resvg, il n'est importé
 * que par l'endpoint image.
 *
 * POURQUOI charger par FICHIER et non par buffer. resvg-js 2.6.2 n'accepte QUE des
 * chemins de police (`fontFiles`/`fontDirs`) — l'option `fontBuffers` d'une version
 * plus récente est IGNORÉE en 2.6.2. L'ancien code la passait : aucune police n'était
 * chargée, `loadSystemFonts:false` → tout le TEXTE était droppé (cadres et traits
 * dessinés, mais image sans un mot). On écrit donc les TTF bundlés dans /tmp (seul
 * répertoire inscriptible sur Vercel) et on passe leurs chemins.
 *
 * POURQUOI mapper les familles génériques. Les noms internes des TTF ne coïncident
 * pas tous avec la demande du SVG : la mono s'appelle « JetBrains Mono Medium », le
 * SVG demande « JetBrains Mono ». Sans repli, les lignes de match (en mono) seraient
 * droppées. On câble donc monospace → « JetBrains Mono Medium », sans-serif → « Geist ».
 */
import { Resvg, type ResvgRenderOptions } from '@resvg/resvg-js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ANTON_TTF, GEIST_TTF, MONO_TTF } from './fonts.ttf.b64';
import { renderShareSvg, type ShareVM } from './shareImage';

function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

// Écrit les TTF bundlés dans un répertoire temporaire, UNE fois par instance.
let fontFilesCache: string[] | null = null;
function fontFiles(): string[] {
	if (fontFilesCache) return fontFilesCache;
	const dir = mkdtempSync(join(tmpdir(), 'mtj-fonts-'));
	fontFilesCache = (
		[
			['anton.ttf', ANTON_TTF],
			['geist.ttf', GEIST_TTF],
			['jetbrains-mono.ttf', MONO_TTF]
		] as const
	).map(([name, b64]) => {
		const p = join(dir, name);
		writeFileSync(p, b64ToBytes(b64));
		return p;
	});
	return fontFilesCache;
}

/** Options de police : chemins TTF + familles génériques câblées sur les vraies polices. */
function fontOptions(): NonNullable<ResvgRenderOptions['font']> {
	return {
		fontFiles: fontFiles(),
		loadSystemFonts: false, // aucune police système sur Vercel : tout vient des TTF
		defaultFontFamily: 'Geist',
		serifFamily: 'Geist',
		sansSerifFamily: 'Geist', // repli de « Anton, …, sans-serif » et « Geist, …, sans-serif »
		monospaceFamily: 'JetBrains Mono Medium', // repli de « JetBrains Mono, …, monospace »
		cursiveFamily: 'Geist',
		fantasyFamily: 'Geist'
	};
}

/** Vrai s'il y a au moins ~20 pixels d'encre (sombres) sur fond blanc. */
function hasInk(px: Buffer): boolean {
	let ink = 0;
	for (let i = 0; i < px.length; i += 4) {
		if (px[i] < 200 && px[i + 1] < 200 && px[i + 2] < 200 && px[i + 3] > 40) {
			if (++ink > 20) return true;
		}
	}
	return false;
}

// Auto-test des polices, UNE fois par instance. Rend un glyphe dans CHAQUE famille et
// vérifie qu'il produit de l'encre. Si une police ne charge pas, resvg DROPPE le texte
// en silence → image de partage vide. On préfère LEVER : pas d'image plutôt qu'une
// image vide diffusée à mille personnes (exigence produit).
let fontsOk: boolean | null = null;
function assertFontsRenderable(): void {
	if (fontsOk === true) return;
	if (fontsOk === false) throw new Error('polices de partage indisponibles (auto-test déjà échoué)');
	const familles: [nom: string, generique: string][] = [
		['Anton', 'sans-serif'],
		['Geist', 'sans-serif'],
		['JetBrains Mono', 'monospace']
	];
	for (const [nom, generique] of familles) {
		const probe =
			`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60">` +
			`<rect width="140" height="60" fill="#ffffff"/>` +
			`<text x="6" y="46" font-family="'${nom}', ${generique}" font-size="44" fill="#000000">8Ag</text></svg>`;
		const img = new Resvg(probe, { font: fontOptions() }).render();
		if (!hasInk(img.pixels)) {
			fontsOk = false;
			throw new Error(`police « ${nom} » ne rend aucun glyphe — image de partage refusée`);
		}
	}
	fontsOk = true;
}

/** Rend l'image de partage en PNG (largeur 1080 par défaut ; le gabarit garde son
 *  ratio 1080 × 1350). Lève si les polices ne rendent pas. */
export function renderSharePng(vm: ShareVM, width = 1080): Uint8Array {
	assertFontsRenderable(); // garde-fou : jamais d'image sans texte
	const svg = renderShareSvg(vm, false); // resvg compose avec les fichiers TTF fournis
	const options: ResvgRenderOptions = {
		fitTo: { mode: 'width', value: width },
		font: fontOptions()
	};
	return new Resvg(svg, options).render().asPng() as unknown as Uint8Array;
}
