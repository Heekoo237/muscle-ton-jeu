<script lang="ts">
	// Barre de crédits (DESIGN.md §7.2). Le solde et « Recharger » n'apparaissent
	// qu'une fois l'utilisateur devenu client crédits (`show`). Pendant l'essai
	// gratuit, la barre reste sobre — juste le wordmark, aucune pression commerciale.
	let { credits = 0, show = false }: { credits?: number; show?: boolean } = $props();

	const low = $derived(credits === 1);
</script>

<header class="credits-bar">
	<div class="container inner">
		{#if show}
			<span class="solde">
				<span class="t-chiffre-md num" class:low>{credits}</span>
				<span class="t-body mot">crédits</span>
			</span>
			<a class="btn-primary-sm" href="/recharge">Recharger</a>
		{:else}
			<a class="brand" href="/dashboard" aria-label="Muscle Ton Jeu — accueil">
				<img class="brand-mark" src="/mtj-logo-transparent-1024.png" alt="" width="28" height="28" decoding="async" />
				<span class="brand-name">Muscle Ton Jeu</span>
			</a>
		{/if}
	</div>
</header>

<style>
	.credits-bar {
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
	.solde {
		display: inline-flex;
		align-items: baseline;
		gap: var(--s-1);
	}
	.num {
		color: var(--c-ink);
	}
	.num.low {
		color: var(--c-ocre);
	}
	.mot {
		color: var(--c-ink-2);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		text-decoration: none;
		min-width: 0;
	}
	.brand-mark {
		width: 28px;
		height: 28px;
		display: block;
		flex: 0 0 auto;
	}
	.brand-name {
		font-family: var(--font-title);
		font-size: 20px;
		line-height: 1;
		letter-spacing: -0.5px;
		text-transform: uppercase;
		color: var(--c-ink);
		white-space: nowrap;
	}
	.btn-primary-sm {
		display: inline-flex;
		align-items: center;
		height: 48px;
		padding: 0 var(--s-4);
		border-radius: var(--r-pill);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		font-weight: 600;
		font-size: 14px;
		text-decoration: none;
	}
	.btn-primary-sm:active {
		transform: scale(0.98);
	}
</style>
