<script lang="ts">
	import type { PageData } from './$types';
	import TicketCard from '$lib/components/TicketCard.svelte';
	import TallyBlock from '$lib/components/TallyBlock.svelte';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { data }: { data: PageData } = $props();

	const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
	function pct(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
	function cote(v: number): string {
		return v.toFixed(2).replace('.', ',');
	}
</script>

<svelte:head><title>Mon tableau de bord — Muscle Ton Jeu</title></svelte:head>

<!-- Hero -->
<section class="hero">
	<div class="container inner">
		<h1 class="t-display titre">Ton ticket<br />tient-il<br />debout ?</h1>
		<p class="t-body-lg sub">
			Envoie la capture de ton ticket. On te montre les sélections fragiles et ton
			ticket renforcé.
		</p>
		<a class="btn-primary" href="/analyser"
			>Analyser mon ticket{data.ticketOffert ? ' gratuitement' : ''}</a
		>
		{#if data.premierPassage}
			<p class="t-small encart">
				Ton prochain ticket coûtera {data.prochainCout} crédit{data.prochainCout > 1 ? 's' : ''}.
				Recharge à partir de 500 F.
			</p>
		{/if}
		<LegalNote variant="hero" />
	</div>
</section>

<!-- Analyse du matin -->
{#if data.daily}
	<section class="band canvas">
		<div class="container inner">
			<h2 class="t-h2">L'analyse du matin</h2>
			<div class="daily">
				<div class="row1">
					<span class="t-body">{data.daily.matchLabel}</span>
					<span class="t-cote">{heure.format(new Date(data.daily.dateMs))}</span>
				</div>
				<div class="row1">
					<span class="t-small dim">{data.daily.marche} · cote proposée</span>
					<span class="t-cote">{cote(data.daily.coteProposee)}</span>
				</div>
				<div class="sep"></div>
				<div class="row1">
					<span class="t-small dim">Chances réelles</span>
					<span class="t-chiffre-md">{pct(data.daily.probabilitePct)}</span>
				</div>
				<LegalNote />
			</div>
		</div>
	</section>
{/if}

<!-- Mes tickets -->
<section class="band sunk">
	<div class="container inner">
		<h2 class="t-h2">Mes tickets</h2>
		{#if data.tickets.length === 0}
			<p class="t-body dim">Ton premier ticket analysé apparaîtra ici.</p>
		{:else}
			<div class="liste">
				{#each data.tickets as t (t.id)}
					<TicketCard dateMs={t.dateMs} nbMatchs={t.nbMatchs} nbFragiles={t.nbFragiles} />
				{/each}
			</div>
		{/if}
	</div>
</section>

<!-- Bilan -->
{#if data.bilan}
	<section class="band canvas">
		<div class="container inner">
			<h2 class="t-h2">Bilan</h2>
			<TallyBlock
				ticketsAnalyses={data.bilan.ticketsAnalyses}
				fragilesMarques={data.bilan.fragilesMarques}
				tombes={data.bilan.tombes}
			/>
		</div>
	</section>
{/if}

<Footer />

<style>
	.inner {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.hero {
		background: linear-gradient(180deg, #fbeae3 0%, #f8f1e4 100%);
		padding: var(--s-12) 0;
	}
	.hero .titre {
		margin: 0;
		color: var(--c-ink);
	}
	.hero .sub {
		color: var(--c-ink-2);
		margin: 0;
	}
	.encart {
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		color: var(--c-ink-2);
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
	.band {
		padding: var(--s-10) 0;
		border-top: 1px solid var(--c-line);
	}
	.band.canvas {
		background: var(--c-canvas);
	}
	.band.sunk {
		background: var(--c-canvas-sunk);
	}
	.band .t-h2 {
		margin: 0;
	}
	.daily {
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.row1 {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.dim {
		color: var(--c-ink-2);
	}
	.sep {
		height: 1px;
		background: var(--c-line);
	}
	.liste {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	@media (min-width: 768px) {
		.hero {
			padding: var(--s-16) 0;
		}
		.hero .titre {
			font-size: 56px;
		}
		.btn-primary {
			width: auto;
			min-width: 280px;
		}
		.band {
			padding: var(--s-16) 0;
		}
	}
</style>
