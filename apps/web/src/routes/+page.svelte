<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import LegalNote from '$lib/components/LegalNote.svelte';
</script>

<svelte:head>
	<title>Muscle Ton Jeu</title>
	<meta
		name="description"
		content="Envoie la capture de ton ticket. On repère les sélections fragiles et on te montre une version renforcée de ton ticket."
	/>
</svelte:head>

<main>
	<!-- Bande hero : unique lavis autorisé du produit (DESIGN.md §5.1) -->
	<section class="hero">
		<div class="container">
			<h1 class="t-display logo">MUSCLE<br />TON<br />JEU</h1>
			<p class="t-body-lg chapeau measure">
				Envoie la capture de ton ticket. On repère les sélections fragiles et on te
				montre une version renforcée de ton ticket.
			</p>
			<a class="btn-primary" href="/analyser">Analyser mon ticket</a>
			<LegalNote variant="hero" />
		</div>
	</section>
</main>

<Footer />

<style>
	.hero {
		background: linear-gradient(180deg, #fbeae3 0%, #f8f1e4 100%);
		padding: var(--s-12) 0;
	}
	.logo {
		color: var(--c-accent); /* 3e et dernier emploi de l'accent : le logo */
		margin: 0 0 var(--s-6);
	}
	.chapeau {
		color: var(--c-ink-2);
		margin: 0 0 var(--s-8);
	}
	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		padding: 0 var(--s-6);
		border-radius: var(--r-pill);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		font-weight: 600;
		font-size: 16px;
		text-decoration: none;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	@media (min-width: 768px) {
		.hero {
			padding: var(--s-16) 0;
		}
		.t-display {
			font-size: 56px;
		}
		.btn-primary {
			width: auto;
			min-width: 280px;
		}
	}
	@media (min-width: 1280px) {
		.t-display {
			font-size: 72px;
		}
	}
</style>
