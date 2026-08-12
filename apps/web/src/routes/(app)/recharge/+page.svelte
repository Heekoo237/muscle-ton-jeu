<script lang="ts">
	import type { PageData } from './$types';
	import { formatFranc } from '$lib/format';
	let { data }: { data: PageData } = $props();

	function creditsLabel(c: number | 'illimite'): string {
		return c === 'illimite' ? 'Illimité 72 h' : `${c} crédits`;
	}
</script>

<svelte:head><title>Recharger — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	{#if data.besoin > 0}
		<!-- Écran de blocage (PRD §5.4) : bloque l'affichage, jamais l'entrée. -->
		<h1 class="t-h1">Ton ticket est prêt.</h1>
		<p class="t-body-lg sous">
			{data.besoin} crédit{data.besoin > 1 ? 's' : ''} nécessaire{data.besoin > 1 ? 's' : ''}.
		</p>
		<div class="solde-box">
			<span class="t-body">Il te reste</span>
			<span class="t-chiffre-md">{data.credits}</span>
			<span class="t-body">crédit{data.credits > 1 ? 's' : ''}.</span>
		</div>
		<p class="t-body garde">Ton ticket est gardé. Tu le retrouveras ici.</p>
	{:else}
		<h1 class="t-h1">Recharger</h1>
	{/if}

	<form method="POST" action="?/payer" class="packs">
		<input type="hidden" name="retour" value={data.retour} />
		<label class="field-label t-small" for="msisdn">Ton numéro Mobile Money</label>
		<input class="field" id="msisdn" name="msisdn" inputmode="tel" placeholder="6XX XXX XXX" />

		{#each data.packs as pack (pack.id)}
			<button
				class="pack-card"
				class:featured={pack.id === data.featured}
				name="pack"
				value={pack.id}
			>
				{#if pack.id === data.featured && data.besoin > 0}
					<span class="badge-accent">Couvre ton ticket</span>
				{/if}
				<span class="nom t-h3">{pack.nom}</span>
				<span class="prix t-chiffre-md">{formatFranc(pack.prix)}</span>
				<span class="contenu t-body">{creditsLabel(pack.credits)}</span>
				<span class="mention t-small">{pack.mention}</span>
			</button>
		{/each}
	</form>

	<a class="t-small support" href="/aide">J'ai payé, je n'ai rien reçu</a>
</main>

<style>
	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-12);
	}
	.sous {
		color: var(--c-ink-2);
		margin: var(--s-2) 0 var(--s-4);
	}
	.solde-box {
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.garde {
		color: var(--c-ink-2);
		margin: var(--s-3) 0 var(--s-8);
	}
	.field-label {
		display: block;
		color: var(--c-ink-2);
		margin-bottom: var(--s-1);
	}
	.field {
		width: 100%;
		height: 52px;
		padding: 0 var(--s-5);
		border-radius: var(--r-pill);
		border: 1px solid var(--c-line);
		background: var(--c-surface);
		font-family: var(--font-body);
		font-size: 16px;
		margin-bottom: var(--s-6);
	}
	.field:focus {
		outline: none;
		border-color: var(--c-line-strong);
		box-shadow: 0 0 0 3px var(--c-line-strong);
	}
	.packs {
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.pack-card {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 'nom prix' 'contenu prix' 'mention mention';
		gap: var(--s-1) var(--s-3);
		text-align: left;
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-lg);
		padding: var(--s-5);
		min-height: 112px;
		cursor: pointer;
	}
	.pack-card:active {
		transform: scale(0.99);
	}
	.pack-card.featured {
		border: 1px solid var(--c-line-strong);
		border-top: 3px solid var(--c-accent-line);
	}
	.nom {
		grid-area: nom;
	}
	.prix {
		grid-area: prix;
		align-self: center;
	}
	.contenu {
		grid-area: contenu;
		color: var(--c-ink-2);
	}
	.mention {
		grid-area: mention;
		color: var(--c-ink-3);
	}
	.badge-accent {
		position: absolute;
		top: calc(-1 * var(--s-3));
		left: var(--s-5);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		border-radius: var(--r-pill);
		height: 28px;
		display: inline-flex;
		align-items: center;
		padding: 0 var(--s-3);
		font-size: 14px;
		font-weight: 600;
	}
	.support {
		display: inline-block;
		margin-top: var(--s-8);
		color: var(--c-ink-2);
	}
</style>
