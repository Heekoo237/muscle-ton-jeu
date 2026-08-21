<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
	const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
	function kickoff(ms: number): string {
		return `${jour.format(new Date(ms))} · ${heure.format(new Date(ms))}`;
	}
</script>

<svelte:head><title>Mon historique — Muscle Ton Jeu</title></svelte:head>

<div class="wrap">
	<h1 class="t-h1 titre">Mon historique</h1>

	{#if data.lignes.length === 0}
		<p class="t-body dim">Ton premier ticket analysé apparaîtra ici.</p>
	{:else}
		<div class="liste">
			{#each data.lignes as l (l.id)}
				<a class="card" href={`/dashboard/historique/${l.id}`}>
					<div class="l1">
						<span class="t-h3">{jour.format(new Date(l.dateMs))} · {l.nbMatchs} match{l.nbMatchs > 1 ? 's' : ''}</span>
						{#if l.statut === 'attente'}<span class="badge">En attente</span>{/if}
						{#if l.statut === 'sans_reglement'}<span class="badge">Rien à régler</span>{/if}
						{#if l.statut === 'indisponible'}<span class="badge">Résultat indisponible</span>{/if}
					</div>

					<span class="dit t-small">
						{#if l.nbFragiles > 0}
							{l.nbFragiles} marqué{l.nbFragiles > 1 ? 's' : ''} trop juste{l.nbFragiles > 1 ? 's' : ''}
						{:else}
							Rien à retirer
						{/if}
					</span>

					{#if l.statut === 'attente'}
						{#if l.kickoffMs != null}
							<span class="passe t-body">Coup d'envoi {kickoff(l.kickoffMs)}</span>
						{/if}
					{:else if l.statut === 'sans_reglement'}
						<span class="dit t-body">Aucun match analysable — rien à régler.</span>
					{:else if l.statut === 'indisponible'}
						<span class="dit t-body">On n'a pas pu récupérer le résultat de ce match.</span>
						{#if l.verdictDateMs != null}
							<span class="dit t-small">Joué le {jour.format(new Date(l.verdictDateMs))}</span>
						{/if}
					{:else if l.statut === 'passe'}
						<span class="passe t-body">Ton ticket est passé</span>
						{#if l.verdictDateMs != null}
							<span class="dit t-small">Réglé le {jour.format(new Date(l.verdictDateMs))}</span>
						{/if}
					{:else}
						<span class="passe t-body">Tombé{l.tombeSur ? ` sur ${l.tombeSur}` : ''}</span>
						{#if l.verdictRenforce}
							<span class="verdict t-small">La version renforcée serait passée</span>
						{/if}
						{#if l.verdictDateMs != null}
							<span class="dit t-small">Réglé le {jour.format(new Date(l.verdictDateMs))}</span>
						{/if}
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap {
		max-width: 720px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-10);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.titre {
		margin: 0;
	}
	.dim {
		color: var(--c-ink-2);
	}
	.liste {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
		text-decoration: none;
		color: var(--c-ink);
		transition: transform 100ms ease-out;
	}
	.card:active {
		transform: scale(0.99);
	}
	.l1 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.dit {
		color: var(--c-ink-2);
	}
	.passe {
		color: var(--c-ink);
	}
	.verdict {
		color: var(--c-ocre);
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
