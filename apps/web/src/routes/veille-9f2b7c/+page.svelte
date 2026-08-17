<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const periodes: { cle: 'jour' | '7j' | '30j'; label: string }[] = [
		{ cle: 'jour', label: "Aujourd'hui" },
		{ cle: '7j', label: '7 jours' },
		{ cle: '30j', label: '30 jours' }
	];
	const fmt = (n: number) => n.toLocaleString('fr-FR');
</script>

<svelte:head>
	<title>Veille</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main>
	<header>
		<h1>Veille</h1>
		<nav aria-label="Période">
			{#each periodes as p (p.cle)}
				<a href={`?p=${p.cle}`} class:actif={data.periode === p.cle} data-sveltekit-noscroll>
					{p.label}
				</a>
			{/each}
		</nav>
	</header>

	<section>
		<h2>Inscriptions</h2>
		<div class="paire">
			<div class="stat">
				<span class="nombre">{fmt(data.inscriptions.periode)}</span>
				<span class="libelle">Nouveaux comptes</span>
			</div>
			<div class="stat">
				<span class="nombre">{fmt(data.inscriptions.total)}</span>
				<span class="libelle">Total des comptes</span>
			</div>
		</div>
	</section>

	<section>
		<h2>Analyses</h2>
		<div class="paire">
			<div class="stat">
				<span class="nombre">{fmt(data.analyses.periode)}</span>
				<span class="libelle">Tickets analysés</span>
			</div>
			<div class="stat">
				<span class="nombre">{fmt(data.analyses.total)}</span>
				<span class="libelle">Total analysés</span>
			</div>
		</div>
	</section>
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 16px 64px;
		color: #1a1a1a;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 24px;
	}
	h1 {
		font-size: 20px;
		margin: 0;
		letter-spacing: 0.02em;
	}
	nav {
		display: flex;
		gap: 4px;
		background: rgba(0, 0, 0, 0.05);
		border-radius: 999px;
		padding: 4px;
	}
	nav a {
		font-size: 13px;
		padding: 6px 12px;
		border-radius: 999px;
		color: #4a4a4a;
		text-decoration: none;
		white-space: nowrap;
	}
	nav a.actif {
		background: #1a1a1a;
		color: #f8f1e4;
	}
	section {
		margin-bottom: 20px;
		background: #fff;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 16px;
		padding: 20px;
	}
	h2 {
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #6a6a6a;
		margin: 0 0 16px;
	}
	.paire {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.nombre {
		font-size: 34px;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.libelle {
		font-size: 13px;
		color: #6a6a6a;
	}
</style>
