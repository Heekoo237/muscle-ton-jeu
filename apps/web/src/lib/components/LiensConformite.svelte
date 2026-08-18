<script lang="ts">
	// Liens de conformité, présents sur TOUTES les pages du produit connecté
	// (CLAUDE.md conformité n°5 : « Jeu responsable » accessible depuis toutes les
	// pages) + rappel 18+ et mentions légales. Discret, jamais un accent de marque.
</script>

<footer class="conformite">
	<span class="age">18+</span>
	<a href="/jeu-responsable">Jeu responsable</a>
	<span class="sep" aria-hidden="true">·</span>
	<a href="/legal">Mentions légales</a>
</footer>

<style>
	.conformite {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		padding: var(--s-4);
		font-size: 13px;
		color: var(--c-ink-3);
	}
	.conformite a {
		color: var(--c-ink-3);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.sep {
		color: var(--c-line-strong);
	}
	.age {
		font-weight: 600;
		color: var(--c-ink-2);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-pill);
		padding: 1px 8px;
		font-size: 12px;
		letter-spacing: 0.4px;
	}
</style>
