<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Résultat — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<h1 class="t-h1">Ton ticket est prêt</h1>
	<p class="t-body-lg">
		{data.analysables} match{data.analysables > 1 ? 's' : ''} analysable{data.analysables > 1 ? 's' : ''}
		sur {data.total}. Statut : {data.statut}.
	</p>
	<p class="t-body note">
		Le module de comparaison (les deux tickets côte à côte, les pourcentages, la
		version renforcée) est construit en Session 4.
	</p>
</main>

<style>
	main {
		padding-top: var(--s-8);
	}
	.note {
		color: var(--c-ink-3);
		margin-top: var(--s-6);
	}
</style>
