<script lang="ts">
	// Ligne de l'écran de validation (DESIGN.md §7.9). Trois états, doublés d'une
	// forme (filet gauche 3 px + icône), jamais dépendants de la seule couleur.
	// Corrections sans clavier : chips en pilule. Formulaires progressifs → OK sans JS.
	import type { Selection, Market } from '$lib/types';
	import { formatCote } from '$lib/format';

	let { selection }: { selection: Selection } = $props();

	const index = $derived(String(selection.ordre).padStart(2, '0'));

	/** OVER_2_5 → « 2,5 » pour les chips de seuil. */
	function seuil(m: Market): string {
		return m.replace(/^(OVER|UNDER)_/, '').replace('_', ',');
	}
	const overUnder = $derived(
		selection.candidates?.[0]?.startsWith('OVER') ? 'Plus de' : 'Moins de'
	);
</script>

<div class="line" data-state={selection.etatResolution}>
	<span class="idx t-cote">{index}</span>

	<div class="body">
		<p class="match t-body">{selection.matchLabel || selection.texteBrut}</p>

		{#if selection.etatResolution === 'certain'}
			<div class="l2">
				<span class="t-small marche">{selection.libelleFr}</span>
				{#if selection.coteSaisie != null}
					<span class="t-cote cote">{formatCote(selection.coteSaisie)}</span>
				{/if}
			</div>
		{:else if selection.etatResolution === 'ambigu'}
			<p class="t-small question">Quel seuil ? {overUnder} combien de buts ?</p>
			<form method="POST" action="?/corriger" class="chips">
				<input type="hidden" name="ordre" value={selection.ordre} />
				{#each selection.candidates ?? [] as m (m)}
					<button class="chip t-body" name="marche" value={m}>{seuil(m)}</button>
				{/each}
			</form>
		{:else}
			<p class="t-small nonc">non analysée · non facturée</p>
			<form method="POST" action="?/retirer">
				<input type="hidden" name="ordre" value={selection.ordre} />
				<button class="btn-ghost t-body">Retirer</button>
			</form>
		{/if}
	</div>

	<span class="icon" aria-hidden="true">
		{#if selection.etatResolution === 'certain'}
			<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
		{:else if selection.etatResolution === 'ambigu'}
			<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /><path d="M12 10v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><circle cx="12" cy="18" r="1" fill="currentColor" /></svg>
		{:else}
			<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" /></svg>
		{/if}
	</span>
</div>

<style>
	.line {
		position: relative;
		display: grid;
		grid-template-columns: 24px 1fr 20px;
		gap: var(--s-3);
		align-items: start;
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		padding-left: var(--s-4);
		margin-bottom: var(--s-3);
		min-height: 64px;
	}
	/* Filet gauche 3 px sémantique, arrondi (§7.9) */
	.line::before {
		content: '';
		position: absolute;
		left: 0;
		top: 8px;
		bottom: 8px;
		width: 3px;
		border-radius: var(--r-xs);
	}
	.line[data-state='certain']::before {
		background: var(--c-vert);
	}
	.line[data-state='ambigu'] {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
	}
	.line[data-state='ambigu']::before {
		background: var(--c-ocre);
	}
	.line[data-state='inconnu'] {
		background: var(--c-rouge-wash);
		border-color: var(--c-rouge);
	}
	.line[data-state='inconnu']::before {
		background: var(--c-rouge);
	}
	.idx {
		color: var(--c-ink-3);
	}
	.match {
		margin: 0;
		color: var(--c-ink);
	}
	.l2 {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
		margin-top: var(--s-1);
	}
	.marche {
		color: var(--c-ink-2);
	}
	.cote {
		color: var(--c-ink-3);
	}
	.question {
		color: var(--c-ocre);
		margin: var(--s-1) 0 var(--s-2);
	}
	.nonc {
		color: var(--c-rouge);
		margin: var(--s-1) 0 var(--s-2);
	}
	.chips {
		display: flex;
		gap: var(--s-2);
		flex-wrap: wrap;
	}
	.chip {
		min-height: 48px;
		padding: 0 var(--s-4);
		border-radius: var(--r-pill);
		background: var(--c-surface);
		color: var(--c-ink);
		border: 1px solid var(--c-line-strong);
		font-weight: 600;
		cursor: pointer;
	}
	.chip:active {
		transform: scale(0.98);
	}
	.btn-ghost {
		min-height: 48px;
		padding: 0 var(--s-4);
		border: none;
		background: transparent;
		color: var(--c-ink-2);
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: var(--c-line-strong);
		text-underline-offset: 2px;
	}
	.icon {
		display: inline-flex;
		justify-content: center;
		padding-top: 2px;
	}
	.line[data-state='certain'] .icon {
		color: var(--c-vert);
	}
	.line[data-state='ambigu'] .icon {
		color: var(--c-ocre);
	}
	.line[data-state='inconnu'] .icon {
		color: var(--c-rouge);
	}
</style>
