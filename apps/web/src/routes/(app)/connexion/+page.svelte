<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Connexion — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<h1 class="t-h1">Ton analyse est prête.</h1>
	<p class="t-body-lg intro">Connecte-toi pour voir ton résultat. Un seul tap.</p>

	<form method="POST" action="?/google">
		<input type="hidden" name="retour" value={data.retour} />
		<button class="btn-dark" type="submit">Continuer avec Google</button>
	</form>

	<a class="t-body aide" href="/aide">Problème pour te connecter ?</a>
</main>

<style>
	main {
		padding-top: var(--s-12);
		text-align: center;
	}
	.intro {
		color: var(--c-ink-2);
		margin: var(--s-3) 0 var(--s-8);
	}
	.btn-dark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border: none;
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
	}
	.btn-dark:active {
		transform: scale(0.98);
	}
	.aide {
		display: inline-block;
		margin-top: var(--s-6);
		color: var(--c-ink-2);
	}
</style>
