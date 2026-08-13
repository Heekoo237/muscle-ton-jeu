<script lang="ts">
	import type { PageData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import HistoryMarquee from '$lib/components/HistoryMarquee.svelte';

	let { data }: { data: PageData } = $props();

	const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
	const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

	function pct(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
	function kickoff(ms: number): string {
		return `${jour.format(new Date(ms))} · ${heure.format(new Date(ms))}`;
	}

	// Le 3e bloc n'apparaît qu'à partir de 3 tickets analysés.
	const montreTombes = $derived(data.stats.ticketsAnalyses >= 3);
</script>

<svelte:head><title>Accueil — Muscle Ton Jeu</title></svelte:head>

<div class="wrap">
	<!-- 1 · SALUTATION -->
	<h1 class="t-display salut">Bonjour {data.prenom}</h1>

	<!-- 2 · TROIS STATISTIQUES (jamais animées : les chiffres apparaissent) -->
	<section class="stats" aria-label="Tes statistiques">
		<div class="stat">
			<span class="num t-chiffre-md">{data.credits}</span>
			<span class="lbl t-small">crédit{data.credits > 1 ? 's' : ''} restant{data.credits > 1 ? 's' : ''}</span>
		</div>
		<div class="stat">
			<span class="num t-chiffre-md">{data.stats.ticketsAnalyses}</span>
			<span class="lbl t-small">ticket{data.stats.ticketsAnalyses > 1 ? 's' : ''} analysé{data.stats.ticketsAnalyses > 1 ? 's' : ''}</span>
		</div>
		{#if montreTombes}
			<div class="stat">
				<span class="num t-chiffre-md">
					{data.stats.fragilesTombes} <span class="sur">sur {data.stats.fragilesMarques}</span>
				</span>
				<span class="lbl t-small">fragiles effectivement tombés</span>
			</div>
		{/if}
	</section>

	<!-- 3 · DEUX BOUTONS (un seul accent visible) -->
	<div class="actions">
		<a class="btn-primary" href="/analyser">Analyser un ticket</a>
		<a class="btn-dark" href="/recharge">Recharger</a>
	</div>

	<!-- 4 · ANALYSE DU JOUR -->
	{#if data.daily}
		<section class="bloc">
			<h2 class="t-h2">L'analyse du jour</h2>
			{#if data.dailyVue}
				<div class="daily vue">
					<div class="row1">
						<span class="t-body">{data.daily.matchLabel}</span>
						<span class="badge">vue</span>
					</div>
					<p class="t-small dim">Prochaine analyse offerte demain matin.</p>
				</div>
			{:else}
				<div class="daily">
					<div class="row1">
						<span class="t-body">{data.daily.matchLabel}</span>
						<span class="t-cote">{heure.format(new Date(data.daily.dateMs))}</span>
					</div>
					<div class="row1">
						<span class="t-small dim">{data.daily.marche} · chances réelles</span>
						<span class="t-chiffre-md">{pct(data.daily.probabilitePct)}</span>
					</div>
					<LegalNote />
				</div>
			{/if}
		</section>
	{/if}

	<!-- 5 · TICKETS EN COURS (uniquement ; sinon rien) -->
	{#if data.ticketsEnCours.length > 0}
		<section class="bloc">
			<h2 class="t-h2">Tickets en cours</h2>
			<div class="liste">
				{#each data.ticketsEnCours as t (t.id)}
					<a class="encours" href={`/dashboard/historique/${t.id}`}>
						<div class="l1">
							<span class="t-h3">{jour.format(new Date(t.dateMs))} · {t.nbMatchs} match{t.nbMatchs > 1 ? 's' : ''}</span>
							<span class="badge">En attente</span>
						</div>
						{#if t.kickoffMs != null}
							<span class="l2 t-small dim">Coup d'envoi {kickoff(t.kickoffMs)}</span>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- 6 · BANDEAU D'HISTORIQUE (données réelles, ≥ 20 résultats) -->
	{#if data.historique.length >= 20}
		<HistoryMarquee items={data.historique} />
	{/if}
</div>

<style>
	.wrap {
		max-width: 720px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-10);
		display: flex;
		flex-direction: column;
		gap: var(--s-8);
	}
	.salut {
		margin: 0;
		color: var(--c-ink);
	}

	/* 2 · Statistiques */
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: var(--s-3);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.num {
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.num .sur {
		font-size: 16px;
		color: var(--c-ink-3);
		letter-spacing: 0;
	}
	.lbl {
		color: var(--c-ink-2);
	}

	/* 3 · Actions */
	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.btn-primary,
	.btn-dark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border-radius: var(--r-pill);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		text-decoration: none;
		transition: transform 100ms ease-out;
	}
	.btn-primary {
		background: var(--c-accent);
		color: var(--c-ink-inverse);
	}
	.btn-dark {
		background: var(--c-ink);
		color: var(--c-ink-inverse);
	}
	.btn-primary:active,
	.btn-dark:active {
		transform: scale(0.98);
	}

	/* 4 & 5 · Blocs */
	.bloc {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.bloc .t-h2 {
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
	.daily.vue {
		background: var(--c-canvas-sunk);
		border-color: var(--c-line);
	}
	.row1 {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.dim {
		color: var(--c-ink-2);
		margin: 0;
	}
	.liste {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.encours {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
		text-decoration: none;
		color: var(--c-ink);
		transition: transform 100ms ease-out;
	}
	.encours:active {
		transform: scale(0.99);
	}
	.l1 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.l2 {
		color: var(--c-ink-2);
	}
	.badge {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		color: var(--c-ink-3);
		font-size: 14px;
	}
	.daily.vue .badge {
		background: var(--c-surface);
	}

	@media (min-width: 600px) {
		.actions {
			flex-direction: row;
		}
		.actions .btn-primary,
		.actions .btn-dark {
			flex: 1;
		}
	}
</style>
