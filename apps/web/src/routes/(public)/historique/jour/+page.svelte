<script lang="ts">
	import type { PageData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import PublicTicketCard from '$lib/components/PublicTicketCard.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Tickets du jour — Historique public</title>
	<meta name="description" content="Tous les tickets réglés du jour, ratés inclus. Anonyme, non modifié." />
</svelte:head>

<main class="container">
	<a class="retour" href="/historique">← Historique public</a>
	<h1 class="t-h1">Tickets du jour</h1>

	{#if data.sousLePlancher || data.tickets.length === 0}
		<div class="vide">
			<p class="t-body-lg">Rien à montrer pour l'instant.</p>
		</div>
	{:else}
		<p class="t-body sous measure">
			Tous les tickets réglés aujourd'hui, ratés compris. Rien n'est trié pour flatter — la
			liste brute reste visible.
		</p>
		<div class="liste">
			{#each data.tickets as t (t.id)}
				<PublicTicketCard {t} />
			{/each}
		</div>
	{/if}

	<LegalNote />
</main>

<style>
	.container {
		max-width: var(--container-max);
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-10);
	}
	.retour {
		display: inline-block;
		margin-bottom: var(--s-3);
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.sous {
		color: var(--c-ink-3);
		margin-top: var(--s-2);
	}
	.measure {
		max-width: 62ch;
	}
	.vide {
		margin-top: var(--s-6);
	}
	.liste {
		margin-top: var(--s-6);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
</style>
