<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Ce qu'on analyse — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<a class="retour" href="/">← Accueil</a>

	<h1 class="t-h1">Ce qu'on analyse</h1>
	<p class="t-body intro">
		On lit ton ticket et on analyse les matchs de ces compétitions. Les autres, on les garde
		dans ton ticket — on ne les analyse pas, et on ne te les facture pas.
	</p>

	<section class="bloc">
		<h2 class="t-h3">Analysées finement</h2>
		<p class="t-small sous">Les championnats qu'on a mesurés en profondeur.</p>
		<ul class="liste">
			{#each data.mesurees as c (c.nom)}
				<li>
					<span class="nom">{c.nom}</span>
					{#if c.pays}<span class="pays">{c.pays}</span>{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section class="bloc">
		<h2 class="t-h3">Analysées d'après les cotes</h2>
		<p class="t-small sous">Les autres compétitions couvertes — coupes, tournois. Analyse plus prudente.</p>
		{#if data.coteSeule.length > 0}
			<ul class="liste">
				{#each data.coteSeule as c (c.nom)}
					<li>
						<span class="nom">{c.nom}</span>
						{#if c.pays}<span class="pays">{c.pays}</span>{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="t-body vide">Aucune en ce moment — reviens en saison de coupes.</p>
		{/if}
	</section>

	<p class="t-small bouge">
		Cette liste bouge : les coupes apparaissent quand elles commencent et disparaissent quand
		elles finissent.
	</p>
</main>

<style>
	main {
		padding-top: var(--s-5);
		padding-bottom: var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.retour {
		color: var(--c-ink-3);
		text-decoration: none;
		font-size: 15px;
	}
	h1 {
		margin: 0;
	}
	.intro {
		margin: 0;
		color: var(--c-ink-2);
		max-width: var(--measure);
	}
	.bloc {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.bloc h2 {
		margin: 0;
	}
	.sous {
		margin: 0;
		color: var(--c-ink-3);
	}
	.liste {
		list-style: none;
		margin: var(--s-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.liste li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
		padding: var(--s-2) var(--s-3);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.nom {
		font-size: 16px;
		color: var(--c-ink);
	}
	.pays {
		font-size: 14px;
		color: var(--c-ink-3);
		text-align: right;
	}
	.vide {
		margin: 0;
		color: var(--c-ink-3);
	}
	.bouge {
		margin: var(--s-3) 0 0;
		color: var(--c-ink-3);
		max-width: var(--measure);
		font-style: italic;
	}
</style>
