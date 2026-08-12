<script lang="ts">
	import type { PageData } from './$types';
	import ComparisonModule from '$lib/components/ComparisonModule.svelte';
	import LegalNote from '$lib/components/LegalNote.svelte';

	let { data }: { data: PageData } = $props();
	const vm = $derived(data.vm);

	function pct(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
</script>

<svelte:head><title>Ton ticket, renforcé — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<h1 class="t-h1">Ton ticket, renforcé</h1>

	{#if vm.conflitMemeMatch}
		<p class="t-small conflit" role="note">
			Deux sélections portent sur le même match. La probabilité combinée est approchée.
		</p>
	{/if}

	<ComparisonModule
		lignes={vm.lignes}
		probaTotalePct={vm.probaTotalePct}
		probaRenforceePct={vm.probaRenforceePct}
	/>

	<!-- Ligne de résultat (§8.3). Aucune flèche, aucun « gain potentiel ». -->
	<div class="resultline" aria-live="polite">
		{#if vm.rienARetirer}
			<p class="t-body-lg">Rien à retirer. Ton ticket tient debout.</p>
		{:else}
			<p class="t-body-lg">
				{vm.nbRetirees} match{vm.nbRetirees > 1 ? 's' : ''} retiré{vm.nbRetirees > 1 ? 's' : ''}.
				Tes chances passent de <span class="num">{pct(vm.probaTotalePct)}</span> à
				<span class="num">{pct(vm.probaRenforceePct)}</span>.
			</p>
		{/if}
	</div>
	<LegalNote />

	<p class="t-body analyse measure">{vm.texte}</p>

	<a class="btn-primary" href={`/partage/${data.ticketId}`} target="_blank" rel="noopener">
		Partager
	</a>
</main>

<style>
	main {
		padding-top: var(--s-4);
		padding-bottom: var(--s-12);
	}
	h1 {
		margin: 0 0 var(--s-4);
	}
	.conflit {
		color: var(--c-ocre);
		margin: 0 0 var(--s-3);
	}
	.resultline {
		background: var(--c-accent-wash);
		border: 1px solid var(--c-accent-line);
		border-radius: var(--r-md);
		padding: var(--s-5) var(--s-4);
		margin-top: var(--s-6);
	}
	.resultline p {
		margin: 0;
		color: var(--c-ink);
	}
	.num {
		font-family: var(--font-body);
		font-weight: 600;
		font-feature-settings: 'tnum' 1;
	}
	.analyse {
		color: var(--c-ink-2);
		margin: var(--s-6) 0;
	}
	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		font-weight: 600;
		text-decoration: none;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	@media (min-width: 768px) {
		.btn-primary {
			width: auto;
			min-width: 240px;
		}
	}
</style>
