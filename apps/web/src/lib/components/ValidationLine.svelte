<script lang="ts">
	// Ligne de validation (maquette ui-screens ÉCRAN 2). Trois états, doublés d'une
	// forme (filet gauche 3 px + icône). TOUTE la ligne est tappable : elle ouvre
	// la feuille de correction pour changer le pari. Aucune saisie au clavier.
	import type { ValidationLineVM } from '../../routes/(app)/analyser/validation/+page.server';
	import { formatCote } from '$lib/format';

	let { selection, onOpen }: { selection: ValidationLineVM; onOpen: (s: ValidationLineVM) => void } =
		$props();

	const index = $derived(String(selection.ordre).padStart(2, '0'));
	const etat = $derived(selection.etatResolution);
</script>

<button class="line" data-state={etat} type="button" onclick={() => onOpen(selection)}>
	<span class="idx">{index}</span>
	<span class="ic">{etat === 'certain' ? '✓' : etat === 'ambigu' ? '▲' : '✕'}</span>
	<div class="mid">
		<div class="match">{selection.matchLabel}</div>
		{#if etat === 'certain'}
			<div class="market">{selection.libelleFr}</div>
		{:else if etat === 'ambigu'}
			<div class="hint oc">À corriger — plusieurs lectures possibles</div>
		{:else}
			<div class="hint">Non couverte — corrige ou retire</div>
		{/if}
	</div>
	{#if etat === 'certain' && selection.coteSaisie != null}
		<span class="cote">{formatCote(selection.coteSaisie)}</span>
	{:else}
		<span class="chev" aria-hidden="true">›</span>
	{/if}
</button>

<style>
	.line {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		min-height: 64px;
		padding: var(--s-3) var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		box-sizing: border-box;
		font-family: var(--font-body);
		text-align: left;
		cursor: pointer;
	}
	.line:active {
		transform: scale(0.995);
	}
	.line[data-state='certain'] {
		border-left: 3px solid var(--c-vert);
	}
	.line[data-state='ambigu'] {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.line[data-state='inconnu'] {
		background: var(--c-rouge-wash);
		border-left: 3px solid var(--c-rouge);
	}
	.idx {
		flex: 0 0 24px;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink-3);
	}
	.ic {
		flex: 0 0 16px;
		font-size: 16px;
		font-weight: 600;
		line-height: 1;
	}
	.line[data-state='certain'] .ic {
		color: var(--c-vert);
	}
	.line[data-state='ambigu'] .ic {
		color: var(--c-ocre);
		font-weight: 400;
	}
	.line[data-state='inconnu'] .ic {
		color: var(--c-rouge);
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
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.market {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.hint {
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.hint.oc {
		color: var(--c-ocre);
	}
	.cote {
		flex: 0 0 44px;
		text-align: right;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.chev {
		flex: 0 0 auto;
		color: var(--c-ink-3);
		font-size: 22px;
		line-height: 1;
	}
</style>
