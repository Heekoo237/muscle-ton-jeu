/**
 * shareImagePng.ts — Rasterisation SERVEUR de l'image de partage en PNG (resvg),
 * polices DESIGN.md embarquées (TTF). Cible < 300 ms, résultat mis en cache.
 *
 * Isolé du rendu SVG : ce module charge le binaire natif resvg, il n'est importé
 * que par l'endpoint image.
 */
import { Resvg } from '@resvg/resvg-js';
import { ANTON_TTF, GEIST_TTF, MONO_TTF } from './fonts.ttf.b64';
import { renderShareSvg, type ShareVM } from './shareImage';

function b64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

const FONT_BUFFERS = [ANTON_TTF, GEIST_TTF, MONO_TTF].map(b64ToBytes);

/** Rend l'image de partage en PNG 1080 × 1350. */
export function renderSharePng(vm: ShareVM): Uint8Array {
	// SVG sans polices embarquées : resvg compose avec les buffers TTF fournis.
	const svg = renderShareSvg(vm, false);
	// `fontBuffers` est honoré au runtime par resvg-js mais absent de ses types.
	const options = {
		fitTo: { mode: 'width', value: 1080 },
		font: { fontBuffers: FONT_BUFFERS, loadSystemFonts: false }
	} as unknown as ConstructorParameters<typeof Resvg>[1];
	return new Resvg(svg, options).render().asPng() as unknown as Uint8Array;
}
