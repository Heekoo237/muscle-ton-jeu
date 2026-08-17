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
		<a class="brand" href="/" aria-label="Muscle Ton Jeu — accueil">
			<img class="brand-mark" src="/mtj-logo-transparent-1024.png" alt="" width="30" height="30" decoding="async" />
			<span class="brand-name">Muscle Ton Jeu</span>
		</a>
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
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		text-decoration: none;
		min-width: 0;
	}
	.brand-mark {
		width: 30px;
		height: 30px;
		display: block;
		flex: 0 0 auto;
	}
	.brand-name {
		font-family: var(--font-title);
		font-size: 22px;
		line-height: 1;
		letter-spacing: -0.5px;
		text-transform: uppercase;
		color: var(--c-ink);
		white-space: nowrap;
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
