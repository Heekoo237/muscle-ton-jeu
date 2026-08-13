<script lang="ts">
	import type { PageData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';

	let { data }: { data: PageData } = $props();

	const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
	const dateLabel = $derived(dateFmt.format(new Date(data.dateMs)));

	function pctBig(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
	function cote(v: number): string {
		return v.toFixed(2).replace('.', ',');
	}

	const analysables = $derived(data.lignes.filter((l) => l.analysable));
	const gardees = $derived(analysables.filter((l) => !l.retiree));
</script>

<svelte:head><title>Analyse du {dateLabel} — Muscle Ton Jeu</title></svelte:head>

<div class="wrap">
	<div class="tete">
		<a class="retour" href="/dashboard/historique">‹ Mon historique</a>
		<h1 class="t-h1">Analyse du {dateLabel}</h1>
		<p class="t-small sous">{data.nbMatchs} match{data.nbMatchs > 1 ? 's' : ''} analysé{data.nbMatchs > 1 ? 's' : ''} · consultable à vie</p>
	</div>

	{#if data.texte}
		<p class="t-body-lg analyse">{data.texte}</p>
	{/if}

	<!-- Ton ticket (E2) -->
	<section class="bloc e2">
		<header class="bloc-head"><span class="titre">Ton ticket</span></header>
		{#each analysables as l (l.ordre)}
			<div class="row" class:fragile={l.fragile}>
				<span class="idx">{l.index}</span>
				<div class="mid">
					<div class="match">{l.matchLabel}</div>
					<div class="marche" class:oc={l.fragile}>
						{#if l.fragile}<span class="tri">▲</span>{/if}{l.libelleFr}{l.fragile ? ' · fragile' : ''}
					</div>
				</div>
				{#if l.cote != null}<span class="cote">{cote(l.cote)}</span>{/if}
			</div>
		{/each}
		<div class="pied">
			<div class="xl ink">{pctBig(data.probaTotalePct)}</div>
			<div class="sous2">chances que le ticket passe</div>
		</div>
	</section>

	<!-- Ton ticket renforcé (E3) -->
	<section class="bloc e3">
		<header class="bloc-head"><span class="titre">Ton ticket renforcé</span></header>
		{#each analysables as l (l.ordre)}
			<div class="row" class:removed={l.retiree}>
				<span class="idx">{l.index}</span>
				<div class="mid">
					<div class="match" class:strike={l.retiree}>{l.matchLabel}</div>
					<div class="marche" class:strike={l.retiree}>{l.libelleFr}</div>
				</div>
				{#if l.retiree}
					<span class="badge">retiré</span>
				{:else if l.cote != null}
					<span class="cote">{cote(l.cote)}</span>
				{/if}
			</div>
		{/each}
		<div class="pied">
			<div class="xl accent">{pctBig(data.probaRenforceePct)}</div>
			<div class="sous2">chances que le ticket passe · {gardees.length} sélections</div>
		</div>
	</section>

	<div class="verdict">
		{#if data.nbRetirees === 0}
			<div class="t-body-lg">Rien à retirer. Ton ticket tenait debout.</div>
		{:else}
			<div class="t-body-lg">
				{data.nbRetirees} match{data.nbRetirees > 1 ? 's' : ''} retiré{data.nbRetirees > 1 ? 's' : ''}.
				Tes chances passaient de <span class="v">{pctBig(data.probaTotalePct)}</span> à
				<span class="v">{pctBig(data.probaRenforceePct)}</span>.
			</div>
		{/if}
		<LegalNote />
	</div>

	<a class="btn-primary" href="/analyser">Analyser un nouveau ticket</a>
</div>

<style>
	.wrap {
		max-width: 720px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-10);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.tete {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.tete h1 {
		margin: 0;
	}
	.retour {
		font-size: 14px;
		font-weight: 600;
		color: var(--c-ink-2);
		text-decoration: none;
	}
	.sous {
		color: var(--c-ink-3);
		margin: 0;
	}
	.analyse {
		color: var(--c-ink-2);
		margin: 0;
	}
	.bloc {
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.bloc.e3 {
		border-color: var(--c-line-strong);
		border-top: 3px solid var(--c-accent-line);
	}
	.bloc-head {
		display: flex;
		align-items: center;
		height: 44px;
		padding: 0 var(--s-4);
		background: var(--c-canvas-sunk);
		border-bottom: 1px solid var(--c-line);
	}
	.bloc-head .titre {
		font-family: var(--font-body);
		font-size: 18px;
		font-weight: 600;
		letter-spacing: 0.6px;
		text-transform: uppercase;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		min-height: 64px;
		padding: var(--s-2) var(--s-4);
		border-bottom: 1px solid var(--c-line);
		box-sizing: border-box;
	}
	.row.fragile {
		background: var(--c-ocre-wash);
		border-left: 3px solid var(--c-ocre);
	}
	.row.removed {
		background: var(--c-canvas-sunk);
	}
	.idx {
		flex: 0 0 24px;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink-3);
	}
	.mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.match {
		font-size: 16px;
		color: var(--c-ink);
	}
	.marche {
		font-size: 14px;
		color: var(--c-ink-2);
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.marche.oc {
		color: var(--c-ocre);
	}
	.tri {
		font-size: 13px;
		line-height: 1;
	}
	.match.strike,
	.marche.strike {
		color: var(--c-ink-3);
		text-decoration: line-through;
	}
	.cote {
		flex: 0 0 56px;
		text-align: right;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.badge {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		background: var(--c-canvas);
		border-radius: var(--r-pill);
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.pied {
		padding: var(--s-5) var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.xl {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 52px;
		line-height: 1;
		letter-spacing: -1.5px;
		font-feature-settings: 'tnum' 1;
	}
	.xl.ink {
		color: var(--c-ink);
	}
	.xl.accent {
		color: var(--c-accent);
	}
	.sous2 {
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.verdict {
		background: var(--c-accent-wash);
		border: 1px solid var(--c-accent-line);
		border-radius: var(--r-md);
		padding: var(--s-5) var(--s-4);
	}
	.verdict .v {
		font-weight: 600;
		font-feature-settings: 'tnum' 1;
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
		transition: transform 100ms ease-out;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
</style>
