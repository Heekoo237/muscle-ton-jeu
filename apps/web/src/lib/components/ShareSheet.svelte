<script lang="ts">
	// Feuille de partage. Mobile : monte depuis le bas. Desktop : modale centrée.
	// WhatsApp via l'API Web Share native (image + texte) quand disponible ; sinon
	// repli : téléchargement de l'image + copie du texte, avec la consigne.
	import { onDestroy } from 'svelte';

	let {
		imageUrl,
		shareUrl,
		onClose
	}: { imageUrl: string; shareUrl: string; onClose: () => void } = $props();

	const TEXTE = 'Regarde ce que mon ticket donnait vraiment. muscletonjeu.com';

	let busy = $state(false);
	let copied = $state(false);
	let consigne = $state('');
	let objectUrls: string[] = [];

	onDestroy(() => objectUrls.forEach((u) => URL.revokeObjectURL(u)));

	/** Récupère l'image en PNG. Le serveur la rend déjà en PNG ; repli : on
	 *  rasterise le SVG côté client (canvas) si jamais l'endpoint renvoie du SVG. */
	async function toPng(): Promise<Blob> {
		const blob = await (await fetch(imageUrl)).blob();
		if (blob.type.includes('png')) return blob;

		const svgUrl = URL.createObjectURL(blob);
		objectUrls.push(svgUrl);
		const img = new Image();
		img.decoding = 'async';
		img.src = svgUrl;
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = 1080;
		canvas.height = 1350;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('canvas');
		ctx.drawImage(img, 0, 0, 1080, 1350);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png')
		);
	}

	function download(png: Blob) {
		const url = URL.createObjectURL(png);
		objectUrls.push(url);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'muscle-ton-jeu.png';
		a.click();
	}

	const waUrl = () => `https://wa.me/?text=${encodeURIComponent(`${TEXTE} ${shareUrl}`)}`;

	async function partagerWhatsApp() {
		if (busy) return;
		consigne = '';
		const nav = navigator as Navigator & {
			canShare?: (d: ShareData) => boolean;
			share?: (d: ShareData) => Promise<void>;
		};

		// Desktop sans partage natif : ouvrir WhatsApp directement (appel synchrone,
		// non bloqué). Le lien y affiche l'image en aperçu.
		if (!nav.share) {
			window.open(waUrl(), '_blank', 'noopener');
			return;
		}

		// Mobile : partage natif (image + texte) ; l'utilisateur choisit contact ou
		// statut. Sans partage de fichier : au moins le texte + le lien.
		busy = true;
		try {
			const png = await toPng();
			const file = new File([png], 'muscle-ton-jeu.png', { type: 'image/png' });
			if (nav.canShare?.({ files: [file] })) {
				await nav.share({ files: [file], text: TEXTE, url: shareUrl });
			} else {
				await nav.share({ text: TEXTE, url: shareUrl });
			}
		} catch (e) {
			// Annulation volontaire : on ne fait rien. Autre échec : repli WhatsApp.
			if ((e as Error)?.name !== 'AbortError') window.open(waUrl(), '_blank', 'noopener');
		}
		busy = false;
	}

	async function telecharger() {
		if (busy) return;
		busy = true;
		try {
			download(await toPng());
			consigne = 'Image enregistrée.';
		} catch {
			consigne = 'Le téléchargement a échoué. Réessaie.';
		}
		busy = false;
	}

	async function copierLien() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			consigne = 'Copie indisponible. Sélectionne le lien manuellement.';
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div class="backdrop" onclick={onClose} role="presentation"></div>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Partager">
	<div class="handle" aria-hidden="true"></div>

	<div class="apercu">
		<img src={imageUrl} alt="Aperçu du partage" />
	</div>

	<button class="btn primary" type="button" onclick={partagerWhatsApp} disabled={busy}>
		Partager sur WhatsApp
	</button>
	<button class="btn" type="button" onclick={telecharger} disabled={busy}>Télécharger l'image</button>
	<button class="btn" type="button" onclick={copierLien}>{copied ? 'Lien copié ✓' : 'Copier le lien'}</button>

	{#if consigne}
		<p class="consigne" aria-live="polite">{consigne}</p>
	{/if}

	<button class="fermer" type="button" onclick={onClose}>Fermer</button>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgba(36, 32, 27, 0.55);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 51;
		max-height: 92vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		border-bottom: none;
		border-radius: var(--r-lg) var(--r-lg) 0 0;
		padding: var(--s-3) var(--s-4) var(--s-6);
	}
	.handle {
		width: 40px;
		height: 4px;
		border-radius: var(--r-pill);
		background: var(--c-line-strong);
		margin: 0 auto var(--s-2);
	}
	.apercu {
		align-self: center;
		width: 200px;
		border-radius: var(--r-sm);
		overflow: hidden;
		border: 1px solid var(--c-line);
		margin-bottom: var(--s-2);
	}
	.apercu img {
		display: block;
		width: 100%;
		height: auto;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		color: var(--c-ink);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.btn:active {
		transform: scale(0.98);
	}
	.btn:disabled {
		opacity: 0.6;
	}
	.btn.primary {
		background: var(--c-accent);
		border: none;
		color: var(--c-ink-inverse);
	}
	.consigne {
		margin: 0;
		text-align: center;
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.fermer {
		align-self: center;
		margin-top: var(--s-2);
		background: none;
		border: none;
		color: var(--c-ink-2);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		min-height: 48px;
	}

	/* Desktop : modale centrée plutôt que feuille ancrée en bas. */
	@media (min-width: 768px) {
		.sheet {
			left: 50%;
			right: auto;
			bottom: auto;
			top: 50%;
			transform: translate(-50%, -50%);
			width: 420px;
			max-width: calc(100vw - 32px);
			border: 1px solid var(--c-line-strong);
			border-radius: var(--r-lg);
		}
		.handle {
			display: none;
		}
	}
</style>
