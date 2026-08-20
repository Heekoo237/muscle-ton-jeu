<script lang="ts">
	// Bloc bilan (DESIGN.md §7.6). Trois chiffres, 3 colonnes même à 360 px.
	// Aucun graphique, aucune courbe, aucun compteur animé.
	let {
		ticketsAnalyses,
		fragilesMarques,
		tombes
	}: { ticketsAnalyses: number; fragilesMarques: number; tombes: number } = $props();
</script>

<div class="tally">
	<div class="col">
		<span class="t-chiffre-md num">{ticketsAnalyses}</span>
		<span class="t-small lbl">tickets analysés</span>
	</div>
	<div class="col">
		<span class="t-chiffre-md num">{fragilesMarques}</span>
		<span class="t-small lbl">matchs marqués trop justes</span>
	</div>
	<div class="col">
		<span class="t-chiffre-md num">{tombes}</span>
		<span class="t-small lbl">sont effectivement tombés</span>
	</div>
</div>

<style>
	.tally {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-6) var(--s-4);
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: 0 var(--s-3);
	}
	.col + .col {
		border-left: 1px solid var(--c-line);
	}
	.num {
		color: var(--c-ink);
	}
	.lbl {
		color: var(--c-ink-2);
	}
</style>
