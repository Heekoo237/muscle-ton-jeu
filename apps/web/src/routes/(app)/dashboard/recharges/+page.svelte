<script lang="ts">
	import type { PageData } from './$types';
	import { formatFranc } from '$lib/format';
	let { data }: { data: PageData } = $props();

	const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	let copie = $state('');
	async function copier(ref: string) {
		try {
			await navigator.clipboard.writeText(ref);
			copie = ref;
			setTimeout(() => (copie = ''), 1600);
		} catch {
			copie = '';
		}
	}
</script>

<svelte:head><title>Mes recharges — Muscle Ton Jeu</title></svelte:head>

<div class="wrap">
	<div class="tete">
		<a class="retour" href="/dashboard">‹ Tableau de bord</a>
		<h1 class="t-h1">Mes recharges</h1>
	</div>

	{#if data.recharges.length === 0}
		<p class="t-body vide">Aucune recharge pour l'instant.</p>
		<a class="btn-primary" href="/recharge">Recharger</a>
	{:else}
		<ul class="liste">
			{#each data.recharges as r (r.reference)}
				<li class="item" class:enCours={r.enCours}>
					<div class="haut">
						<span class="montant t-chiffre-md">{formatFranc(r.montant)}</span>
						<span class="statut s-{r.statut}">{r.libelle}</span>
					</div>
					<div class="bas t-small">
						<span>{r.operateur} · {r.msisdn}</span>
						<span>{dateFmt.format(new Date(r.dateMs))}</span>
					</div>
					<button class="ref" type="button" onclick={() => copier(r.reference)}>
						{r.reference}{copie === r.reference ? ' ✓ copié' : ''}
					</button>
					{#if r.enCours}
						<a class="reprendre t-small" href={`/recharge/attente?ref=${r.reference}`}>Reprendre</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.wrap { max-width: 720px; margin-inline: auto; padding: var(--s-6) var(--s-4) var(--s-10); display: flex; flex-direction: column; gap: var(--s-5); }
	.tete { display: flex; flex-direction: column; gap: var(--s-2); }
	.tete h1 { margin: 0; }
	.retour { color: var(--c-ink-2); }
	.vide { color: var(--c-ink-2); }
	.liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-3); }
	.item { display: flex; flex-direction: column; gap: var(--s-2); background: var(--c-surface); border: 1px solid var(--c-line); border-radius: var(--r-lg); padding: var(--s-4); }
	.item.enCours { border-color: var(--c-ocre); }
	.haut { display: flex; align-items: center; justify-content: space-between; }
	.statut { font-weight: 700; font-size: 13px; padding: 2px 10px; border-radius: var(--r-pill); }
	.s-success { background: var(--c-vert-wash); color: var(--c-vert); }
	.s-failed, .s-expired { background: var(--c-rouge-wash); color: var(--c-rouge); }
	.s-pending, .s-initiated { background: var(--c-ocre-wash); color: var(--c-ocre); }
	.bas { display: flex; justify-content: space-between; color: var(--c-ink-2); gap: var(--s-3); }
	.ref { align-self: flex-start; font-family: var(--font-mono, monospace); font-weight: 700; color: var(--c-ink); background: var(--c-canvas-sunk); border: 1px solid var(--c-line); border-radius: var(--r-sm); padding: 2px 8px; cursor: pointer; }
	.reprendre { color: var(--c-ocre); font-weight: 600; }
</style>
