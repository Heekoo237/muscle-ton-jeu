<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Confirmation du paiement — Muscle Ton Jeu</title>
	<!-- Sans JS : rafraîchissement tant que le paiement n'est pas confirmé. -->
	{#if data.status === 'pending'}
		<meta http-equiv="refresh" content="2" />
	{/if}
</svelte:head>

<main class="container">
	{#if data.status === 'pending'}
		<div class="pulse" aria-hidden="true"></div>
		<h1 class="t-h1">On vérifie encore.</h1>
		<p class="t-body-lg intro">
			Ton paiement peut prendre quelques secondes. Reste ici, on te crédite dès que c'est confirmé.
		</p>
		<a class="t-small support" href="/aide">J'ai payé, je n'ai rien reçu</a>
	{:else}
		<h1 class="t-h1">On n'a pas pu confirmer.</h1>
		<p class="t-body-lg intro">Réessaie, ou contacte le support si le montant a été débité.</p>
		<a class="btn-dark" href="/recharge">Réessayer</a>
		<a class="t-small support" href="/aide">J'ai payé, je n'ai rien reçu</a>
	{/if}
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
	.pulse {
		width: 12px;
		height: 12px;
		border-radius: var(--r-pill);
		background: var(--c-ink-3);
		margin: 0 auto var(--s-6);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
			opacity: 0.6;
		}
	}
	.btn-dark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-weight: 600;
		text-decoration: none;
	}
	.support {
		display: inline-block;
		margin-top: var(--s-6);
		color: var(--c-ink-2);
	}
</style>
