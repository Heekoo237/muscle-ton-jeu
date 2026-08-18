<script lang="ts">
	import { page } from '$app/stores';
	import CreditsBar from '$lib/components/CreditsBar.svelte';
	import LiensConformite from '$lib/components/LiensConformite.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Le dashboard a son propre chrome (barre latérale / navigation basse) : pas
	// de barre de crédits globale par-dessus.
	const surDashboard = $derived($page.url.pathname.startsWith('/dashboard'));
</script>

{#if data.demo}
	<!-- Bandeau démo : impossible de le rater. Des données FICTIVES peuvent être
	     mêlées à l'écran (dashboard, historique). Jamais présent en production. -->
	<div class="demo-banniere" role="status">
		Mode démonstration — certaines données affichées sont fictives.
	</div>
{/if}
{#if !surDashboard}
	<CreditsBar credits={data.credits} show={data.montreCredits} />
{/if}
{@render children()}
<!-- Conformité n°5 : Jeu responsable + mentions légales joignables depuis chaque
     page connectée hors dashboard (le dashboard a les siens dans son chrome). -->
{#if !surDashboard}
	<LiensConformite />
{/if}

<style>
	.demo-banniere {
		position: sticky;
		top: 0;
		z-index: 50;
		padding: var(--s-2) var(--s-4);
		background: var(--c-ocre);
		color: var(--c-ink-inverse);
		text-align: center;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.3px;
	}
</style>
