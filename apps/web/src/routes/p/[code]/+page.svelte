<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const titre = 'Regarde ce que mon ticket donnait vraiment.';
	const desc = 'Envoie la capture de ton ticket. On te montre le match qui va le faire tomber.';
</script>

<svelte:head>
	<title>Muscle Ton Jeu</title>
	<meta name="description" content={desc} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={titre} />
	<meta property="og:description" content={desc} />
	<meta property="og:image" content={data.ogImage} />
	<meta property="og:image:width" content="1080" />
	<meta property="og:image:height" content="1350" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={data.ogImage} />
</svelte:head>

<main>
	<!-- eslint-disable-next-line svelte/no-at-html-tags — SVG serveur, sans entrée utilisateur -->
	<div class="image">{@html data.svg}</div>

	<a class="cta" href="/analyser">Analyser mon ticket</a>
	<p class="legal">Outil d'analyse — pas un pronostic garanti · 18+</p>
</main>

<style>
	main {
		max-width: 560px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-12);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-6);
	}
	.image {
		width: 100%;
		max-width: 420px;
		border-radius: var(--r-md);
		overflow: hidden;
		border: 1px solid var(--c-line);
	}
	.image :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 360px;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		font-weight: 600;
		font-size: 16px;
		text-decoration: none;
		transition: transform 100ms ease-out;
	}
	.cta:active {
		transform: scale(0.98);
	}
	.legal {
		font-size: 14px;
		color: var(--c-ink-3);
		text-align: center;
		margin: 0;
	}
</style>
