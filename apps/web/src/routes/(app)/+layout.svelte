<script lang="ts">
	import CreditsBar from '$lib/components/CreditsBar.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

<CreditsBar credits={data.credits} />
{@render children()}
