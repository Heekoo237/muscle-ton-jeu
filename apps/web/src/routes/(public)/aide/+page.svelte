<svelte:head>
	<title>Aide — Muscle Ton Jeu</title>
	<meta name="description" content="Support Muscle Ton Jeu : une question, un problème de connexion ou de paiement." />
</svelte:head>

<main class="container measure">
	<h1 class="t-h1">Aide</h1>
	<p class="t-body-lg">Une question, un souci de connexion ou de paiement ? On répond.</p>

	<section class="bloc">
		<h2 class="t-h3">Contacter le support</h2>
		<p class="t-body">Le support répond sur WhatsApp.</p>
		<!-- Le lien réel est branché en Session 5 (support paiement dès le jour 1). -->
		<a class="btn-outline" href="/aide">Écrire au support</a>
	</section>

	<section class="bloc">
		<h2 class="t-h3">J'ai payé, je n'ai rien reçu</h2>
		<p class="t-body">
			Un paiement Mobile Money peut prendre jusqu'à 40 secondes. Si rien n'arrive,
			écris-nous : on retrouve ta transaction et on crédite.
		</p>
		<a class="btn-outline" href="/aide">Signaler un paiement</a>
	</section>

	<section class="bloc">
		<h2 class="t-h3">Problème pour te connecter</h2>
		<p class="t-body">La connexion se fait avec Google, en un tap. Si ça bloque, écris-nous.</p>
	</section>
</main>

<style>
	main {
		padding-top: var(--s-8);
	}
	.t-body-lg {
		color: var(--c-ink-2);
		margin-bottom: var(--s-8);
	}
	.bloc {
		padding: var(--s-5) 0;
		border-top: 1px solid var(--c-line);
	}
	.bloc .t-body {
		color: var(--c-ink-2);
		margin: var(--s-2) 0 var(--s-4);
	}
	.btn-outline {
		display: inline-flex;
		align-items: center;
		height: 52px;
		padding: 0 var(--s-6);
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--c-ink);
		border: 1px solid var(--c-line-strong);
		font-weight: 600;
		text-decoration: none;
	}
	.btn-outline:active {
		transform: scale(0.98);
	}
</style>
