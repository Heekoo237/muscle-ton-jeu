<script lang="ts">
	// Ligne de validation de lecture (maquette ui-screens ÉCRAN 2). Trois états,
	// doublés d'une forme (filet gauche 3 px + icône). Correction sans clavier :
	// choix en pilule pleine largeur. Formulaires progressifs → OK sans JS.
	import type { Selection, Market } from '$lib/types';
	import { formatCote } from '$lib/format';

	type VM = Selection & { candidateLabels?: { market: Market; label: string }[] };
	let { selection }: { selection: VM } = $props();

	const index = $derived(String(selection.ordre).padStart(2, '0'));
	const question = $derived(
		selection.candidates?.[0]?.startsWith('OVER')
			? 'Plus de buts — choisis le seuil'
			: selection.candidates?.[0]?.startsWith('UNDER')
				? 'Moins de buts — choisis le seuil'
				: 'Deux lectures possibles'
	);
</script>

{#if selection.etatResolution === 'certain'}
	<div class="line green">
		<span class="idx">{index}</span>
		<span class="ic">✓</span>
		<div class="mid">
			<div class="match">{selection.matchLabel}</div>
			<div class="market">{selection.libelleFr}</div>
		</div>
		{#if selection.coteSaisie != null}<span class="cote">{formatCote(selection.coteSaisie)}</span>{/if}
	</div>
{:else if selection.etatResolution === 'ambigu'}
	<div class="line amber col">
		<div class="head">
			<span class="idx">{index}</span>
			<span class="ic oc">▲</span>
			<div class="mid">
				<div class="match">{selection.matchLabel}</div>
				<div class="q">{question}</div>
			</div>
		</div>
		<div class="choices">
			{#each selection.candidateLabels ?? [] as c (c.market)}
				<form method="POST" action="?/corriger">
					<input type="hidden" name="ordre" value={selection.ordre} />
					<button class="choice" name="marche" value={c.market}>{c.label}</button>
				</form>
			{/each}
		</div>
	</div>
{:else}
	<div class="line red">
		<span class="idx">{index}</span>
		<span class="ic rg">✕</span>
		<div class="mid">
			<div class="match">{selection.matchLabel}</div>
			<div class="nonc">non analysée — non facturée</div>
		</div>
		<form method="POST" action="?/retirer">
			<input type="hidden" name="ordre" value={selection.ordre} />
			<button class="retirer">Retirer</button>
		</form>
	</div>
{/if}

<style>
	.line {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		min-height: 64px;
		padding: var(--s-3) var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		box-sizing: border-box;
	}
	.line.col {
		flex-direction: column;
		align-items: stretch;
		gap: var(--s-3);
	}
	.green {
		border-left: 3px solid var(--c-vert);
	}
	.amber {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.red {
		background: var(--c-rouge-wash);
		border-left: 3px solid var(--c-rouge);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--s-3);
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
		color: var(--c-vert);
	}
	.ic.oc {
		color: var(--c-ocre);
		font-weight: 400;
	}
	.ic.rg {
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
	}
	.market {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.q {
		font-size: 14px;
		color: var(--c-ocre);
	}
	.nonc {
		font-size: 14px;
		color: var(--c-ink-3);
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
	.choices {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.choice {
		width: 100%;
		height: 48px;
		padding: 0 var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-pill);
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
		text-align: left;
		cursor: pointer;
	}
	.choice:active {
		transform: scale(0.99);
	}
	.retirer {
		flex: 0 0 auto;
		height: 48px;
		padding: 0 var(--s-3);
		background: transparent;
		border: none;
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink-2);
		cursor: pointer;
	}
</style>
