<script lang="ts">
	import type { PageData } from './$types';
	import FlowHeader from '$lib/components/FlowHeader.svelte';
	import ValidationLine from '$lib/components/ValidationLine.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Validation de lecture — Muscle Ton Jeu</title></svelte:head>

<FlowHeader title="Validation de lecture" back="/analyser" />

<main class="container">
	<div class="intro">
		<h1 class="t-h1">Vérifie ta lecture</h1>
		<p class="t-body sub">Tape sur une ligne pour la corriger. Aucune saisie au clavier.</p>
	</div>

	<div class="lignes">
		{#each data.selections as s (s.ordre)}
			<ValidationLine selection={s} />
		{/each}
	</div>

	<form method="POST" action="?/finaliser" class="action">
		<button class="btn-dark" type="submit" disabled={data.analysables < 1}>
			Analyser {data.analysables} match{data.analysables > 1 ? 's' : ''} sur {data.total}
		</button>
		<p class="t-small compteur">
			{#if data.cout && data.cout > 0}
				{data.cout} crédit{data.cout > 1 ? 's' : ''} · les lignes rouges ne sont pas comptées
			{:else}
				Les lignes rouges ne sont pas comptées
			{/if}
		</p>
	</form>
</main>

<style>
	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.intro h1 {
		margin: 0;
	}
	.sub {
		color: var(--c-ink-2);
		margin: 0;
	}
	.lignes {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.action {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.btn-dark {
		width: 100%;
		height: 52px;
		border: none;
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		font-feature-settings: 'tnum' 1;
		cursor: pointer;
	}
	.btn-dark:active {
		transform: scale(0.98);
	}
	.btn-dark:disabled {
		background: var(--c-canvas-sunk);
		color: var(--c-ink-mute);
		border: 1px solid var(--c-line);
	}
	.compteur {
		color: var(--c-ink-3);
		text-align: center;
		margin: 0;
	}
</style>
