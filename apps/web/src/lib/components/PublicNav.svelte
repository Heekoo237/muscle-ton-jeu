<script lang="ts">
	// Navigation publique (DESIGN.md §7.12). Ne se cache jamais au scroll, aplat
	// opaque (pas de flou : coût GPU sur entrée de gamme). Le wordmark reste en
	// --c-ink (logo-ink) pour laisser le budget accent au contenu de la page.
	import { page } from '$app/state';

	const links = [
		{ href: '/historique', label: 'Historique public' },
		{ href: '/jeu-responsable', label: 'Jeu responsable' },
		{ href: '/aide', label: 'Aide' }
	];
</script>

<nav class="public-nav" aria-label="Navigation principale">
	<div class="container inner">
		<a class="wordmark" href="/" aria-label="Muscle Ton Jeu — accueil">MTJ</a>
		<ul class="links t-body">
			{#each links as link (link.href)}
				<li>
					<a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}
						>{link.label}</a
					>
				</li>
			{/each}
		</ul>
	</div>
</nav>

<style>
	.public-nav {
		position: sticky;
		top: 0;
		z-index: 20;
		height: 60px;
		background: var(--c-canvas-sunk);
		border-bottom: 1px solid var(--c-line);
	}
	.inner {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.wordmark {
		font-family: var(--font-title);
		font-size: 24px;
		color: var(--c-ink);
		letter-spacing: -0.5px;
		text-decoration: none;
	}
	.links {
		display: none;
		list-style: none;
		margin: 0;
		padding: 0;
		gap: var(--s-6);
	}
	.links a {
		color: var(--c-ink-2);
		text-decoration: none;
	}
	.links a:hover,
	.links a[aria-current='page'] {
		color: var(--c-ink);
		text-decoration: underline;
		text-decoration-color: var(--c-line-strong);
		text-underline-offset: 2px;
	}
	@media (min-width: 768px) {
		.public-nav {
			height: 72px;
		}
		.links {
			display: flex;
		}
	}
</style>
