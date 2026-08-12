<script lang="ts">
	import BadgeAge from '$lib/components/BadgeAge.svelte';
</script>

<svelte:head>
	<title>Jeu responsable — Muscle Ton Jeu</title>
	<meta
		name="description"
		content="Muscle Ton Jeu est un outil d'analyse. Une probabilité n'est pas une garantie. 18+."
	/>
</svelte:head>

<main class="container measure">
	<div class="tete">
		<h1 class="t-h1">Jeu responsable</h1>
		<BadgeAge />
	</div>

	<p class="t-body-lg">
		Muscle Ton Jeu est un outil d'analyse et d'aide à la décision. Ce n'est pas un
		bookmaker : on n'accepte aucune mise et on ne verse aucun gain.
	</p>

	<h2 class="t-h2">Une probabilité n'est pas une garantie</h2>
	<p class="t-body">
		Une analyse dit où sont les sélections fragiles d'un ticket. Elle ne dit pas
		ce qui va arriver. Aucun résultat n'est certain. Ne joue jamais un argent dont
		tu as besoin.
	</p>

	<h2 class="t-h2">Garde le contrôle</h2>
	<ul class="t-body liste">
		<li>Fixe-toi une limite avant de commencer, et tiens-la.</li>
		<li>Ne cherche jamais à te refaire après une perte.</li>
		<li>Un plafond de recharge auto-imposé est appliqué par défaut.</li>
		<li>Fais une pause si le jeu cesse d'être un jeu.</li>
	</ul>

	<h2 class="t-h2">Besoin d'aide ?</h2>
	<p class="t-body">
		Si le jeu devient un problème pour toi ou un proche, parles-en. Notre
		<a href="/aide">support</a> peut t'orienter.
	</p>
</main>

<style>
	.tete {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}
	main {
		padding-top: var(--s-8);
	}
	.t-body-lg {
		color: var(--c-ink-2);
	}
	.t-h2 {
		margin-top: var(--s-8);
	}
	.liste {
		color: var(--c-ink-2);
		padding-left: var(--s-5);
	}
	.liste li {
		margin: var(--s-2) 0;
	}
	p.t-body {
		color: var(--c-ink-2);
	}
</style>
