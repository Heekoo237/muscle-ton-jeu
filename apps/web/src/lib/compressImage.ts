/**
 * compressImage — Réduit une capture AVANT envoi. Le forfait data est compté au
 * Cameroun comme en Côte d'Ivoire : on n'envoie pas 4 Mo quand 250 Ko suffisent
 * à lire un ticket. Redimensionne au plus long côté et ré-encode en JPEG.
 *
 * Navigateur uniquement (canvas). Repli silencieux sur le fichier d'origine si
 * le décodage échoue — on n'empêche jamais l'utilisateur d'analyser.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
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
		return await new Promise<Blob>((resolve) => {
			canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', quality);
		});
	} catch {
		return file; // décodage impossible : on envoie l'original, le serveur tranchera
	} finally {
		URL.revokeObjectURL(url);
	}
}
