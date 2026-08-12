<script lang="ts">
	// Carte ticket de l'historique (DESIGN.md §7.5). État factice : en attente
	// (les matchs ne sont pas encore joués — le suivi arrive avec le pipeline).
	let {
		id,
		dateMs,
		nbMatchs,
		nbFragiles
	}: { id: string; dateMs: number; nbMatchs: number; nbFragiles: number } = $props();

	const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
	const dateLabel = $derived(fmt.format(new Date(dateMs)));
</script>

<a class="ticket-card" href={`/resultat`} aria-label={`Ticket du ${dateLabel}, ${nbMatchs} matchs`}>
	<p class="l1 t-h3">{dateLabel} · {nbMatchs} match{nbMatchs > 1 ? 's' : ''}</p>
	<p class="l2 t-small">
		{#if nbFragiles > 0}
			{nbFragiles} marqué{nbFragiles > 1 ? 's' : ''} fragile{nbFragiles > 1 ? 's' : ''}
		{:else}
			Rien à retirer
		{/if}
	</p>
	<p class="l3 t-small"><span class="badge">En attente</span></p>
</a>

<style>
	.ticket-card {
		display: block;
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
		min-height: 96px;
		text-decoration: none;
		color: var(--c-ink);
	}
	.ticket-card:active {
		transform: scale(0.99);
	}
	.l1 {
		margin: 0;
	}
	.l2 {
		margin: var(--s-1) 0 var(--s-3);
		color: var(--c-ink-2);
	}
	.l3 {
		margin: 0;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		color: var(--c-ink-3);
	}
</style>
