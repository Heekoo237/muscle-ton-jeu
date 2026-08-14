<script lang="ts">
	// Feuille de correction (DESIGN.md §7.10, E4). Ancrée en bas, ouverte au tap
	// sur une ligne. Liste les paris possibles du match en pilules ; l'utilisateur
	// choisit celui qu'il avait joué, ou retire la ligne. Aucune saisie au clavier.
	import type { Market } from '$lib/types';
	import type { ValidationLineVM } from '../../routes/(app)/analyser/validation/+page.server';

	// Choix INSTANTANÉ : le tap remonte le marché choisi ; la page met à jour
	// l'affichage tout de suite et enregistre en arrière-plan (jamais d'attente).
	let {
		selection,
		onChoose,
		onNonCouvert,
		onRemove,
		onClose
	}: {
		selection: ValidationLineVM;
		onChoose: (marche: Market, label: string) => void;
		onNonCouvert: () => void;
		onRemove: () => void;
		onClose: () => void;
	} = $props();

	// Marché déjà reconnu comme NON couvert (buteur, mi-temps, corners, cartons…) :
	// on ne pousse pas la liste des marchés couverts, on explique. La liste reste
	// dessous, seulement au cas où on aurait mal lu.
	const dejaNonCouvert = $derived(selection.raison === 'non_couvert');
	// Match résolu ? Si non (championnat non couvert ou match illisible), choisir
	// un marché ne sert à rien : on n'affiche PAS la liste, seulement l'info + retrait.
	const matchResolu = $derived(selection.fixtureId != null);
	const horsCouverture = $derived(selection.raison === 'hors_couverture');
	const nonResolu = $derived(selection.raison === 'non_resolu');
	const horsFenetre = $derived(selection.raison === 'hors_fenetre');
	const commence = $derived(selection.raison === 'commence');

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
		{#if !matchResolu}
			<!-- Match non résolu : choisir un marché ne servirait à rien (pas de match
			     en base). On informe, on ne fait pas semblant de pouvoir analyser. -->
			<div class="nc-banner">
				{#if horsCouverture}
					<p class="nc-titre">Ce match n'est pas dans un championnat qu'on couvre.</p>
					<p class="nc-sous">
						On le garde dans ton ticket, mais on ne l'analyse pas et on ne te le facture pas. Tu
						n'as rien à corriger.
					</p>
				{:else if commence}
					<p class="nc-titre">Ce match a déjà commencé.</p>
					<p class="nc-sous">
						Une analyse d'avant-match n'a plus de sens une fois le coup d'envoi donné. On le
						garde dans ton ticket, sans l'analyser ni te le facturer.
					</p>
				{:else if horsFenetre}
					<p class="nc-titre">Ce match n'est pas encore dans notre période d'analyse.</p>
					<p class="nc-sous">
						On analyse les matchs à venir dès qu'ils sont programmés et cotés. On le garde, sans
						l'analyser ni te le facturer.
					</p>
				{:else if nonResolu}
					<p class="nc-titre">On n'a pas retrouvé ce match.</p>
					<p class="nc-sous">
						Le championnat est couvert, mais on n'a pas reconnu les équipes sous ce nom. On le
						garde, sans l'analyser ni te le facturer.
					</p>
				{:else}
					<p class="nc-titre">On n'a pas réussi à lire ce match.</p>
					<p class="nc-sous">Tu peux le retirer du ticket.</p>
				{/if}
			</div>
		{:else}
			{#if dejaNonCouvert}
				<div class="nc-banner">
					<p class="nc-titre">Ce marché, on ne le couvre pas encore.</p>
					<p class="nc-sous">
						On le garde dans ton ticket, mais on ne l'analyse pas et on ne te le facture pas.
					</p>
				</div>
				<div class="glabel t-small">Si on a mal lu, choisis ton vrai pari</div>
			{/if}

			{#each GROUPS as g (g.titre)}
				<div class="group">
					<div class="glabel t-small">{g.titre}</div>
					<div class="chips">
						{#each g.markets as m (m)}
							<button
								type="button"
								class="chip"
								class:sel={selection.marche === m}
								onclick={() => onChoose(m, labelOf(m))}
							>
								{labelOf(m)}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<div class="actions-bas">
		{#if matchResolu && !dejaNonCouvert}
			<button type="button" class="nc-btn" onclick={onNonCouvert}>
				Ce marché, on ne le couvre pas
			</button>
		{/if}
		<button type="button" class="retirer" onclick={onRemove}>Retirer cette ligne du ticket</button>
	</div>
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
		transition: transform 100ms ease-out;
	}
	.chip.sel {
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		border-color: var(--c-ink);
	}
	.chip:active {
		transform: scale(0.98);
	}
	.nc-banner {
		padding: var(--s-3) var(--s-4);
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		margin-bottom: var(--s-2);
	}
	.nc-titre {
		margin: 0 0 var(--s-1);
		font-weight: 600;
		color: var(--c-ink);
	}
	.nc-sous {
		margin: 0;
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.actions-bas {
		margin-top: var(--s-3);
		padding-top: var(--s-3);
		border-top: 1px solid var(--c-line);
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.nc-btn {
		width: 100%;
		height: 48px;
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-pill);
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
		cursor: pointer;
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
