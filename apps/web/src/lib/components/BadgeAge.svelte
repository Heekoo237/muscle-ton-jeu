<script lang="ts">
	// Badge 18+ (DESIGN.md §7.11). `inverse` sur fond sombre (pied de page).
	let { inverse = false }: { inverse?: boolean } = $props();
</script>

<span class="badge-age t-small" class:inverse>18+</span>

<style>
	.badge-age {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		color: var(--c-ink);
		border: 1px solid var(--c-line-strong);
		font-weight: 600;
		letter-spacing: 0.6px;
	}
	.badge-age.inverse {
		background: transparent;
		color: var(--c-ink-inverse);
		border-color: rgba(248, 241, 228, 0.35);
	}
</style>
