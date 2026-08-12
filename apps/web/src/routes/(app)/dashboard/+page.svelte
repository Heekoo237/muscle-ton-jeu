<script lang="ts">
	import type { PageData } from './$types';
	import TicketCard from '$lib/components/TicketCard.svelte';
	import TallyBlock from '$lib/components/TallyBlock.svelte';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { data }: { data: PageData } = $props();

	const heure = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
	function pct(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
</script>

<svelte:head><title>Mon tableau de bord — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<!-- Zone 1 — Action -->
	<a class="btn-primary" href="/analyser">Analyser un ticket</a>

	{#if data.premierPassage}
		<p class="encart t-small">
			Ton prochain ticket coûtera {data.prochainCout} crédit{data.prochainCout > 1 ? 's' : ''}.
			Recharge à partir de 500 F.
		</p>
	{/if}

	<!-- Zone 2 — Analyse du matin -->
	{#if data.daily}
		<section class="zone">
			<h2 class="t-h2">Analyse du matin</h2>
			<div class="daily">
				<p class="t-h3 match">{data.daily.matchLabel}</p>
				<p class="t-small meta">{heure.format(new Date(data.daily.dateMs))}</p>
				<div class="proba">
					<span class="t-body marche">{data.daily.marche}</span>
					<span class="t-chiffre-md val">{pct(data.daily.probabilitePct)}</span>
				</div>
				<LegalNote />
			</div>
		</section>
	{/if}

	<!-- Zone 3 — Mes tickets -->
	<section class="zone">
		<h2 class="t-h2">Mes tickets</h2>
		{#if data.tickets.length === 0}
			<p class="t-body vide">Ton premier ticket analysé apparaîtra ici.</p>
		{:else}
			<div class="liste">
				{#each data.tickets as t (t.id)}
					<TicketCard id={t.id} dateMs={t.dateMs} nbMatchs={t.nbMatchs} nbFragiles={t.nbFragiles} />
				{/each}
			</div>
		{/if}
	</section>

	<!-- Zone 4 — Bilan -->
	{#if data.bilan}
		<section class="zone">
			<h2 class="t-h2">Bilan</h2>
			<TallyBlock
				ticketsAnalyses={data.bilan.ticketsAnalyses}
				fragilesMarques={data.bilan.fragilesMarques}
				tombes={data.bilan.tombes}
			/>
		</section>
	{/if}
</main>

<Footer />

<style>
	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-10);
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
		font-size: 16px;
		text-decoration: none;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.encart {
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		color: var(--c-ink-2);
		margin-top: var(--s-4);
	}
	.zone {
		margin-top: var(--s-10);
	}
	.zone .t-h2 {
		margin: 0 0 var(--s-4);
	}
	.daily {
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.daily .match {
		margin: 0;
	}
	.daily .meta {
		color: var(--c-ink-3);
		margin: var(--s-1) 0 var(--s-3);
	}
	.proba {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
		padding-top: var(--s-3);
		border-top: 1px solid var(--c-line);
	}
	.marche {
		color: var(--c-ink-2);
	}
	.val {
		color: var(--c-ink);
	}
	.vide {
		color: var(--c-ink-3);
	}
	.liste {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
</style>
