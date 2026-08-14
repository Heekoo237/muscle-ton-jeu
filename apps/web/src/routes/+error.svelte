<script lang="ts">
	// Page d'erreur unique (toutes routes). Jamais une 500 brute : message lisible,
	// jamais technique, + un lien support. La cause exacte reste dans les logs
	// serveur (hooks.server handleError). Fond crème, jamais blanc ni sombre.
	import { page } from '$app/stores';

	const status = $derived($page.status);
	const introuvable = $derived(status === 404);
	const message = $derived(
		introuvable
			? "Cette page n'existe pas ou a été déplacée."
			: ($page.error?.message ?? 'Une erreur est survenue de notre côté.')
	);
</script>

<svelte:head><title>{status} — Muscle Ton Jeu</title></svelte:head>

<main class="wrap">
	<p class="code">{status}</p>
	<h1 class="t-h2">{introuvable ? 'Page introuvable' : 'Petit souci de notre côté'}</h1>
	<p class="t-body msg">{message}</p>

	<div class="actions">
		<a class="btn-dark" href="/">Revenir à l'accueil</a>
		{#if !introuvable}
			<a class="btn-outline" href="/aide" rel="external">Écrire au support</a>
		{/if}
	</div>
</main>

<style>
	.wrap {
		min-height: 70vh;
		max-width: 34rem;
		margin-inline: auto;
		padding: var(--s-10) var(--s-4);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-3);
	}
	.code {
		font-family: var(--font-title);
		font-size: clamp(56px, 18vw, 96px);
		line-height: 1;
		color: var(--c-ink-3);
		margin: 0;
	}
	h1 {
		margin: 0;
	}
	.msg {
		color: var(--c-ink-2);
		margin: 0 0 var(--s-4);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-3);
	}
	.btn-dark,
	.btn-outline {
		display: inline-flex;
		align-items: center;
		height: 52px;
		padding: 0 var(--s-6);
		border-radius: var(--r-pill);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		text-decoration: none;
	}
	.btn-dark {
		background: var(--c-ink);
		color: var(--c-ink-inverse);
	}
	.btn-outline {
		background: transparent;
		color: var(--c-ink);
		border: 1px solid var(--c-line-strong);
	}
</style>
