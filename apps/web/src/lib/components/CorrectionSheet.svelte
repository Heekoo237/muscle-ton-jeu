<script lang="ts">
	// Feuille de correction (DESIGN.md §7.10, E4). Ancrée en bas, ouverte au tap
	// sur une ligne. Liste les paris possibles du match en pilules ; l'utilisateur
	// choisit celui qu'il avait joué, ou retire la ligne. Aucune saisie au clavier.
	import type { Market } from '$lib/types';
	import type { ValidationLineVM } from '../../routes/(app)/analyser/validation/+page.server';

	let { selection, onClose }: { selection: ValidationLineVM; onClose: () => void } = $props();

	const GROUPS: { titre: string; markets: Market[] }[] = [
		{ titre: 'Résultat', markets: ['WIN_HOME', 'DRAW', 'WIN_AWAY'] },
		{ titre: 'Double chance', markets: ['DC_HOME_DRAW', 'DC_DRAW_AWAY', 'DC_HOME_AWAY'] },
		{ titre: 'Nombre de buts', markets: ['OVER_1_5', 'UNDER_1_5', 'OVER_2_5', 'UNDER_2_5', 'OVER_3_5', 'UNDER_3_5'] },
		{ titre: 'Les deux équipes marquent', markets: ['BTTS_YES', 'BTTS_NO'] }
	];

	function labelOf(m: Market): string {
		return selection.options.find((o) => o.market === m)?.label ?? m;
	}
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && onClose()} />

<div class="backdrop" onclick={onClose} role="presentation"></div>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Corriger la ligne">
	<div class="handle"></div>
	<div class="head">
		<h2 class="t-h3">{selection.matchLabel}</h2>
		<button class="close" onclick={onClose} aria-label="Fermer">✕</button>
	</div>

	<div class="scroll">
		{#each GROUPS as g (g.titre)}
			<div class="group">
				<div class="glabel t-small">{g.titre}</div>
				<div class="chips">
					{#each g.markets as m (m)}
						<form method="POST" action="?/corriger">
							<input type="hidden" name="ordre" value={selection.ordre} />
							<button class="chip" class:sel={selection.marche === m} name="marche" value={m}>
								{labelOf(m)}
							</button>
						</form>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<form method="POST" action="?/retirer" class="retirer-form">
		<input type="hidden" name="ordre" value={selection.ordre} />
		<button class="retirer">Retirer cette ligne du ticket</button>
	</form>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(36, 32, 27, 0.55);
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 41;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		border-bottom: none;
		border-radius: var(--r-lg) var(--r-lg) 0 0;
		padding: var(--s-3) var(--s-4) var(--s-4);
	}
	.handle {
		width: 40px;
		height: 4px;
		border-radius: var(--r-pill);
		background: var(--c-line-strong);
		margin: 0 auto var(--s-3);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
	}
	.head h2 {
		margin: 0;
	}
	.close {
		flex: 0 0 auto;
		width: 40px;
		height: 40px;
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line);
		color: var(--c-ink);
		font-size: 15px;
		cursor: pointer;
	}
	.scroll {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
		padding-bottom: var(--s-3);
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.glabel {
		color: var(--c-ink-3);
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.chip {
		min-height: 48px;
		padding: 0 var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-pill);
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
		cursor: pointer;
	}
	.chip.sel {
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		border-color: var(--c-ink);
	}
	.chip:active {
		transform: scale(0.98);
	}
	.retirer-form {
		margin-top: var(--s-3);
		padding-top: var(--s-3);
		border-top: 1px solid var(--c-line);
	}
	.retirer {
		width: 100%;
		height: 48px;
		background: transparent;
		border: none;
		color: var(--c-ink-2);
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		text-decoration: underline;
		text-decoration-color: var(--c-line-strong);
		text-underline-offset: 2px;
		cursor: pointer;
	}
</style>
