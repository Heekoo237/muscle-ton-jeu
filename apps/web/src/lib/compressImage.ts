/**
 * compressImage — Réduit une capture AVANT envoi. Le forfait data est compté au
 * Cameroun comme en Côte d'Ivoire : on n'envoie pas 4 Mo quand 250 Ko suffisent
 * à lire un ticket. Redimensionne au plus long côté et ré-encode en JPEG.
 *
 * GÉNÉREUX SUR LE REPLI (leçon d'un testeur bloqué) : sur un Android bas de gamme
 * sous pression mémoire, `canvas.toBlob` peut rendre un blob VIDE ou TRONQUÉ tout
 * en étant non-null. Une image légère qui CASSE (la vision la refuse « pas un
 * ticket ») est bien pire qu'une image lourde qui PASSE. Donc au moindre doute —
 * blob absent, minuscule, pas plus léger, ou qui ne se re-décode pas — on renvoie
 * L'ORIGINAL. Jamais on n'envoie un blob douteux.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

/** Une capture d'écran de ticket compressée pèse ~30–150 Ko. En dessous de ce
 *  plancher, c'est presque sûrement un blob vide/corrompu → on préfère l'original. */
const MIN_OCTETS_VALIDES = 8000;

/** Le blob compressé se RE-DÉCODE-t-il en une image non vide ? (intégrité réelle) */
async function seRedecode(blob: Blob): Promise<boolean> {
	const url = URL.createObjectURL(blob);
	try {
		const img = await loadImage(url);
		return img.naturalWidth > 0 && img.naturalHeight > 0;
	} catch {
		return false;
	} finally {
		URL.revokeObjectURL(url);
	}
}

export async function compressImage(file: File, maxDim = 1400, quality = 0.7): Promise<Blob> {
	const url = URL.createObjectURL(file);
	try {
		const img = await loadImage(url);
		const longest = Math.max(img.naturalWidth, img.naturalHeight) || 1;
		const scale = Math.min(1, maxDim / longest);
		const w = Math.max(1, Math.round(img.naturalWidth * scale));
		const h = Math.max(1, Math.round(img.naturalHeight * scale));
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return file;
		ctx.drawImage(img, 0, 0, w, h);
		const blob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
		});
		// Au MOINDRE doute → l'original (généreux). Une image lourde qui passe vaut
		// mieux qu'une image légère qui casse.
		if (!blob || blob.size < MIN_OCTETS_VALIDES || blob.size >= file.size) return file;
		if (!(await seRedecode(blob))) return file; // blob tronqué/illisible : original
		return blob;
	} catch {
		return file; // décodage impossible : on envoie l'original, le serveur tranchera
	} finally {
		URL.revokeObjectURL(url);
	}
}
