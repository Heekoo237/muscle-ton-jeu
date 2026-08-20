<script lang="ts">
	// Bandeau d'historique — bas de l'écran de résultat. Alimenté par la base :
	// des sélections déjà marquées dont le match est terminé, avec l'issue réelle.
	// Les résultats défavorables sont montrés aussi, sans tri. La page ne rend ce
	// composant que si au moins 20 résultats existent (aucun remplissage de démo).
	import type { HistoryItem } from '$lib/types';
	const ANTON = "'Anton', Impact, sans-serif";

	let { items }: { items: HistoryItem[] } = $props();
</script>

<section class="wrap">
	<div class="hm" aria-hidden="true">
		<div class="hm-track">
			{#each [0, 1] as dup (dup)}
				<div class="hm-row" style="font-family:{ANTON}">
					{#each items as it, i (dup + '-' + i)}
						<span class="lbl">{it.matchLabel}</span>
						<span class="sep">·</span>
						<span class="mk">{it.fragile ? 'marqué trop juste' : 'solide'}</span>
						<span class="sep">·</span>
						<span class="out" class:tombe={!it.passe}>{it.passe ? 'PASSÉ' : 'TOMBÉ'}</span>
						<span class="slash">/</span>
					{/each}
				</div>
			{/each}
		</div>
	</div>
	<a class="lien" href="/historique">Voir l’historique complet</a>
</section>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.hm {
		background: var(--c-ink);
		overflow: hidden;
		padding: 12px 0;
		border-radius: var(--r-md);
	}
	.hm-track {
		display: flex;
		width: max-content;
		animation: hm-scroll 45s linear infinite;
	}
	@keyframes hm-scroll {
		from {
			transform: translate3d(0, 0, 0);
		}
		to {
			transform: translate3d(-50%, 0, 0);
		}
	}
	.hm-track:hover,
	.hm-track:active {
		animation-play-state: paused;
	}
	.hm-row {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding-right: 8px;
		font-size: 18px;
		line-height: 1.1;
		letter-spacing: -0.3px;
		text-transform: uppercase;
		color: var(--c-ink-inverse);
		white-space: nowrap;
	}
	.hm-row .mk {
		color: rgba(248, 241, 228, 0.72);
	}
	.hm-row .out {
		color: var(--c-ink-inverse);
	}
	/* « tombé » n'est pas une alerte rouge : c'est un fait, montré sobrement. */
	.hm-row .out.tombe {
		color: rgba(248, 241, 228, 0.6);
	}
	.hm-row .sep {
		color: rgba(248, 241, 228, 0.4);
	}
	.hm-row .slash {
		color: rgba(248, 241, 228, 0.4);
		padding-left: 8px;
	}
	.lien {
		align-self: flex-start;
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	@media (prefers-reduced-motion: reduce) {
		.hm-track {
			animation: none;
		}
	}
</style>
