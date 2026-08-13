<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const ticket = $derived(data.contexte === 'ticket');
</script>

<svelte:head><title>Connexion — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	{#if ticket}
		<h1 class="t-h1">Ton ticket est prêt.</h1>
		<p class="t-body-lg intro">Connecte-toi pour voir le résultat. Le premier est offert.</p>
	{:else}
		<h1 class="t-h1">Content de te revoir.</h1>
		<p class="t-body-lg intro">Connecte-toi en un tap.</p>
	{/if}

	<form method="POST" action="?/google">
		<input type="hidden" name="retour" value={data.retour} />
		<button class="btn-dark" type="submit">Continuer avec Google</button>
	</form>

	<a class="t-body aide" href="/aide">Problème pour te connecter ?</a>

	<p class="t-small legal">
		<span class="age">18+</span>
		Google uniquement. Aucun mot de passe, aucun SMS.
	</p>
</main>

<style>
	main {
		padding-top: var(--s-12);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	main h1 {
		margin: 0;
	}
	.intro {
		color: var(--c-ink-2);
		margin: var(--s-3) 0 var(--s-8);
		max-width: 34ch;
	}
	form {
		width: 100%;
		max-width: 360px;
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
		transition: transform 100ms ease-out;
	}
	.btn-dark:active {
		transform: scale(0.98);
	}
	.aide {
		display: inline-block;
		margin-top: var(--s-6);
		color: var(--c-ink-2);
	}
	.legal {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		margin-top: var(--s-8);
		color: var(--c-ink-3);
	}
	.age {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-pill);
		font-weight: 600;
		letter-spacing: 0.6px;
		color: var(--c-ink);
	}
</style>
