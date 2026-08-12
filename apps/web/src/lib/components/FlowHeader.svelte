<script lang="ts">
	// En-tête d'écran de flux (DESIGN.md §7.12) : retour, titre centré tronqué, aide.
	let { title, back = '/dashboard' }: { title: string; back?: string } = $props();
</script>

<div class="flow-header">
	<div class="container inner">
		<a class="btn-icon" href={back} aria-label="Retour">
			<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
				<path
					d="M15 5l-7 7 7 7"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</a>
		<h1 class="t-h3 titre">{title}</h1>
		<a class="btn-icon" href="/aide" aria-label="Aide">
			<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
				<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
				<path
					d="M9.5 9.5a2.5 2.5 0 015 0c0 1.7-2.5 2-2.5 3.5"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<circle cx="12" cy="17" r="1" fill="currentColor" />
			</svg>
		</a>
	</div>
</div>

<style>
	.flow-header {
		height: 56px;
		background: var(--c-canvas);
		border-bottom: 1px solid var(--c-line);
	}
	.inner {
		height: 100%;
		display: grid;
		grid-template-columns: 48px 1fr 48px;
		align-items: center;
		gap: var(--s-2);
	}
	.titre {
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--r-pill);
		background: var(--c-surface);
		color: var(--c-ink);
		border: 1px solid var(--c-line);
		text-decoration: none;
	}
	.btn-icon:active {
		transform: scale(0.98);
	}
</style>
