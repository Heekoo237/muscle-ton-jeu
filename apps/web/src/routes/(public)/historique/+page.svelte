<script lang="ts">
	import type { PageData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';

	let { data }: { data: PageData } = $props();

	const dateFmt = new Intl.DateTimeFormat('fr-FR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
	function formatDate(iso: string): string {
		return dateFmt.format(new Date(iso));
	}
	function pct(p: number): string {
		return `${(p * 100).toFixed(0).replace('.', ',')} %`;
	}
	function rendement(r: number): string {
		const signe = r >= 1 ? '+' : '−';
		const val = Math.abs((r - 1) * 100).toFixed(0);
		return `${signe}${val} %`;
	}
</script>

<svelte:head>
	<title>Historique public — Muscle Ton Jeu</title>
	<meta
		name="description"
		content="Chaque analyse est publiée et horodatée avant le coup d'envoi, ratés inclus, non modifiable après."
	/>
</svelte:head>

<main class="container">
	<h1 class="t-h1">Historique public</h1>
	<p class="t-body intro measure">
		Chaque analyse est publiée et horodatée avant le coup d'envoi. Rien n'est
		modifié après. Les ratés sont affichés au même titre que les réussites.
	</p>

	{#if data.entrees.length === 0}
		<div class="vide">
			<p class="t-body-lg">On n'a pas encore publié d'analyse.</p>
			<p class="t-body">
				La première paraîtra ici, horodatée avant le coup d'envoi.
			</p>
		</div>
	{:else}
		{#if data.bilan}
			<!-- Deux chiffres TOUJOURS ensemble : taux de réussite + rendement (§12) -->
			<div class="bilan">
				<div class="stat">
					<span class="t-chiffre-md">{pct(data.bilan.tauxReussite)}</span>
					<span class="t-small lbl">taux de réussite</span>
				</div>
				<div class="stat">
					<span class="t-chiffre-md">{rendement(data.bilan.rendement)}</span>
					<span class="t-small lbl">rendement à mise fixe</span>
				</div>
			</div>
		{/if}
		<ul class="liste">
			{#each data.entrees as e (e.id)}
				<li class="entree">
					<time class="t-small meta" datetime={e.dateIso}>{formatDate(e.dateIso)}</time>
					<p class="t-body">{e.details}</p>
				</li>
			{/each}
		</ul>
	{/if}

	<LegalNote />
</main>

<style>
	.intro {
		color: var(--c-ink-2);
		margin: var(--s-3) 0 var(--s-8);
	}
	.vide {
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-6);
	}
	.vide .t-body {
		color: var(--c-ink-2);
		margin: var(--s-2) 0 0;
	}
	.bilan {
		display: flex;
		gap: var(--s-6);
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-6) var(--s-4);
		margin-bottom: var(--s-8);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.lbl {
		color: var(--c-ink-2);
	}
	.liste {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.entree {
		padding: var(--s-4) 0;
		border-top: 1px solid var(--c-line);
	}
	.meta {
		color: var(--c-ink-3);
	}
	main {
		padding-top: var(--s-8);
	}
</style>
