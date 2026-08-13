<script lang="ts">
	import { page } from '$app/stores';
	import CreditsBar from '$lib/components/CreditsBar.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	// Le dashboard a son propre chrome (barre latérale / navigation basse) : pas
	// de barre de crédits globale par-dessus.
	const surDashboard = $derived($page.url.pathname.startsWith('/dashboard'));
</script>

{#if !surDashboard}
	<CreditsBar credits={data.credits} show={data.montreCredits} />
{/if}
{@render children()}
