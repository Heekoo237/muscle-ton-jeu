<script lang="ts">
	// Pied de page (DESIGN.md §7.13) — seul aplat sombre du produit. Aucun logo
	// de bookmaker, aucun lien sortant vers un opérateur.
	import BadgeAge from './BadgeAge.svelte';
</script>

<footer class="footer">
	<div class="container">
		<p class="wordmark">MTJ</p>
		<nav class="links t-body" aria-label="Liens de bas de page">
			<a href="/historique">Historique public</a>
			<a href="/jeu-responsable">Jeu responsable</a>
			<a href="/aide">Aide</a>
		</nav>
		<div class="legal">
			<BadgeAge inverse />
			<p class="t-small">Mentions légales · CGU · Confidentialité</p>
		</div>
		<p class="t-small note">
			Muscle Ton Jeu n’accepte aucune mise et ne verse aucun gain.
		</p>
	</div>
</footer>

<style>
	.footer {
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		padding: var(--s-8) 0;
		margin-top: var(--s-12);
	}
	.wordmark {
		font-family: var(--font-title);
		font-size: 24px;
		margin: 0 0 var(--s-6);
	}
	.links {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		margin-bottom: var(--s-6);
	}
	.links a {
		color: var(--c-ink-inverse);
		text-decoration-color: rgba(248, 241, 228, 0.5);
		width: fit-content;
	}
	.links a:hover {
		text-decoration-color: var(--c-ink-inverse);
	}
	.legal {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
	}
	.legal p {
		color: rgba(248, 241, 228, 0.72);
		margin: 0;
	}
	.note {
		color: rgba(248, 241, 228, 0.72);
		margin: 0;
	}
	@media (min-width: 768px) {
		.footer {
			padding: var(--s-12) 0;
		}
		.links {
			flex-direction: row;
			gap: var(--s-6);
		}
	}
</style>
