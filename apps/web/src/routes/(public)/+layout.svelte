<script lang="ts">
	// Chrome partagé des surfaces publiques : nav en haut, pied de page en bas.
	// Jeu responsable est ainsi accessible depuis toutes les pages (conformité §5).
	import PublicNav from '$lib/components/PublicNav.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { children } = $props();
</script>

<PublicNav />
{@render children()}
<Footer />
