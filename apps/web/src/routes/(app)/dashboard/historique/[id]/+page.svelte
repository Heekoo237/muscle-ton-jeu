<script lang="ts">
	import type { PageData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import PaperTicketCompare from '$lib/components/PaperTicketCompare.svelte';
	import { ligneNote } from '$lib/lineStatus';

	let { data }: { data: PageData } = $props();

	const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
	const courtFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
	const dateLabel = $derived(dateFmt.format(new Date(data.dateMs)));

	function pctBig(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}

	const nbFragiles = $derived(data.lignes.filter((l) => l.fragile).length);
	// Toutes les lignes, non analysées comprises : neutres, jamais retirées.
	// « analysable » côté papier = réellement analysée (résolue ET avec proba).
	const paperLines = $derived(
		data.lignes.map((l) => ({
			matchLabel: l.matchLabel,
			libelleFr: l.libelleFr,
			fragile: l.fragile,
			retiree: l.retiree,
			mentionNeutre: l.mentionNeutre,
			// Booléen déjà tranché côté serveur (règle unique isAnalysable) — on le lit.
			analysable: l.analysable
		}))
	);
</script>

<svelte:head><title>Analyse du {dateLabel} — Muscle Ton Jeu</title></svelte:head>

<div class="wrap">
	<div class="tete">
		<a class="retour" href="/dashboard/historique">‹ Mon historique</a>
		<h1 class="t-h1">Ton ticket, lu</h1>
		<p class="t-small sous">{dateLabel} · {data.nbMatchs} match{data.nbMatchs > 1 ? 's' : ''} · consultable à vie</p>
	</div>

	{#if data.synthese}
		<p class="t-body-lg analyse">{data.synthese}</p>
	{/if}

	{#if data.explications.length > 0}
		<div class="explications">
			{#each data.explications as e (e.ordre)}
				<article class="exp" class:badge={e.avecBadge}>
					<div class="exp-match">
						{e.matchLabel}{#if e.avecBadge}&nbsp;<span class="tri" aria-hidden="true">▲</span>{/if}
					</div>
					<div class="exp-marche" class:oc={e.avecBadge}>{e.libelleFr}</div>
					<p class="exp-texte">{e.texte}</p>
				</article>
			{/each}
		</div>
	{/if}

	<!-- Comparaison en tickets papier (même design que le résultat) -->
	<PaperTicketCompare
		lines={paperLines}
		probaTotalePct={data.probaTotalePct}
		probaRenforceePct={data.probaRenforceePct}
		dateLabel={courtFmt.format(new Date(data.dateMs))}
	/>

	<!-- Ligne de verdict -->
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

	<!-- Match par match -->
	<section class="mpm">
		<div class="mpm-head">
			<h2 class="t-h2">Match par match</h2>
			{#if nbFragiles > 0}
				<span class="mpm-badge">{nbFragiles} fragile{nbFragiles > 1 ? 's' : ''}</span>
			{/if}
		</div>
		{#each data.lignes as l (l.ordre)}
			<article class="mpm-card" class:fragile={l.fragile} class:removed={l.retiree}>
				<div class="mpm-top">
					<span class="mpm-match">
						{l.matchLabel}{#if l.fragile}&nbsp;<span class="tri">▲</span>{/if}
					</span>
					{#if l.analysable && l.probabilitePct != null}
						<span class="mpm-pct">{pctBig(l.probabilitePct)}</span>
					{:else}
						<span class="mpm-na">non analysé</span>
					{/if}
				</div>
				<div class="mpm-marche" class:oc={l.fragile}>{l.libelleFr}</div>
				<div class="mpm-note">{ligneNote(l)}</div>
			</article>
		{/each}
	</section>

	<a class="btn-primary" href="/analyser">Analyser un nouveau ticket</a>
</div>

<style>
	.wrap {
		max-width: 940px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-10);
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
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
		max-width: var(--measure);
	}

	/* Explications par sélection retirée (niveau 2) */
	.explications {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.exp {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.exp.badge {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.exp-match {
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	.exp-match .tri {
		color: var(--c-ocre);
		font-size: 13px;
	}
	.exp-marche {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.exp-marche.oc {
		color: var(--c-ocre);
	}
	.exp-texte {
		margin: var(--s-1) 0 0;
		font-size: 15px;
		line-height: 1.45;
		color: var(--c-ink);
		max-width: var(--measure);
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

	/* Match par match */
	.mpm {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.mpm-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
	}
	.mpm-head .t-h2 {
		margin: 0;
	}
	.mpm-badge {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-ocre-wash);
		border: 1px solid var(--c-ocre-line);
		color: var(--c-ocre);
		font-size: 14px;
		font-weight: 600;
	}
	.mpm-card {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.mpm-card.fragile {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.mpm-card.removed {
		background: var(--c-canvas-sunk);
	}
	.mpm-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.mpm-match {
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	.mpm-match .tri {
		color: var(--c-ocre);
		font-size: 13px;
	}
	.mpm-pct {
		flex: 0 0 auto;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 22px;
		letter-spacing: -0.4px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.mpm-na {
		flex: 0 0 auto;
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.mpm-marche {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.mpm-marche.oc {
		color: var(--c-ocre);
	}
	.mpm-note {
		font-size: 14px;
		color: var(--c-ink-3);
	}

	.btn-primary {
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
		text-decoration: none;
		transition: transform 100ms ease-out;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
</style>
