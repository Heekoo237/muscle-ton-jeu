<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<!-- Les icônes (favicon, apple-touch, manifeste) sont déclarées dans app.html —
     globales et présentes dès le prérendu, sans dépendre du montage d'un composant. -->

{@render children()}
