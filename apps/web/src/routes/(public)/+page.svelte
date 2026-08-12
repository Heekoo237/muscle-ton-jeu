<script lang="ts">
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
			<!-- logo-ink : le btn-primary consomme déjà l'accent dans ce viewport (§10.1) -->
			<h1 class="t-display logo">MUSCLE<br />TON<br />JEU</h1>
			<p class="t-body-lg chapeau measure">
				Envoie la capture de ton ticket. On repère les sélections fragiles et on te
				montre une version renforcée de ton ticket.
			</p>
			<a class="btn-primary" href="/analyser">Analyser mon ticket</a>
			<LegalNote variant="hero" />
		</div>
	</section>

	<!-- Positionnement, sans chiffre (sobriété chiffrée sur surface publique) -->
	<section class="band">
		<div class="container measure">
			<h2 class="t-h2">On lit ton ticket entier, pas un match isolé.</h2>
			<p class="t-body">
				C'est l'unité réelle du joueur. On repère les sélections fragiles et on te
				montre une version renforcée du même ticket, obtenue en retirant ces
				sélections. On n'ajoute jamais un match que tu n'as pas choisi.
			</p>
			<h2 class="t-h2 mt">Un taux de réussite n'est jamais montré seul.</h2>
			<p class="t-body">
				Il est toujours accompagné du rendement à mise fixe. C'est le seul chiffre
				honnête. Notre historique est public et horodaté avant le coup d'envoi,
				ratés inclus, non modifiable après.
			</p>
		</div>
	</section>
</main>

<style>
	.hero {
		background: linear-gradient(180deg, #fbeae3 0%, #f8f1e4 100%);
		padding: var(--s-12) 0;
	}
	.logo {
		color: var(--c-ink);
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
	.band {
		padding: var(--s-10) 0;
	}
	.band .t-body {
		color: var(--c-ink-2);
		margin: var(--s-3) 0 0;
	}
	.mt {
		margin-top: var(--s-8);
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
		.band {
			padding: var(--s-16) 0;
		}
	}
	@media (min-width: 1280px) {
		.t-display {
			font-size: 72px;
		}
	}
</style>
