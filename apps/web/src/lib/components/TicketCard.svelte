<script lang="ts">
	// Carte ticket de l'historique (maquette ui-screens ÉCRAN 1, « Mes tickets »).
	// État factice : en attente (les matchs ne sont pas joués — le suivi arrive
	// avec le pipeline).
	let {
		dateMs,
		nbMatchs,
		nbFragiles
	}: { dateMs: number; nbMatchs: number; nbFragiles: number } = $props();

	const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
	const dateLabel = $derived(fmt.format(new Date(dateMs)));
</script>

<a class="ticket-card" href="/resultat" aria-label={`Ticket du ${dateLabel}, ${nbMatchs} matchs`}>
	<div class="l1">
		<span class="t-h3">{dateLabel} · {nbMatchs} match{nbMatchs > 1 ? 's' : ''}</span>
		<span class="badge">En attente</span>
	</div>
	<span class="l2 t-small">
		{#if nbFragiles > 0}
			{nbFragiles} marqué{nbFragiles > 1 ? 's' : ''} fragile{nbFragiles > 1 ? 's' : ''}
		{:else}
			Rien à retirer
		{/if}
	</span>
</a>

<style>
	.ticket-card {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
		text-decoration: none;
		color: var(--c-ink);
	}
	.ticket-card:active {
		transform: scale(0.99);
	}
	.l1 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.l2 {
		color: var(--c-ink-2);
	}
	.badge {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		color: var(--c-ink-3);
		font-size: 14px;
	}
</style>
