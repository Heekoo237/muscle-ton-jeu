<script lang="ts">
	import '../app.css';
	import NavProgress from '$lib/components/NavProgress.svelte';

	let { children } = $props();
</script>

<!-- Les icônes (favicon, apple-touch, manifeste) sont déclarées dans app.html —
     globales et présentes dès le prérendu, sans dépendre du montage d'un composant. -->

<!-- Indicateur de navigation, sur TOUTE transition (barre fine en haut). -->
<NavProgress />

{@render children()}
