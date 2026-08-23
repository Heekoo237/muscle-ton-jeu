<script lang="ts">
	import type { PageData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import PublicTicketCard from '$lib/components/PublicTicketCard.svelte';

	let { data }: { data: PageData } = $props();

	// En-tête : la BASCULE (effet du retrait), JAMAIS un taux de réussite. « 3 sur 12 »
	// se lirait comme un ratio — on donne l'effet, pas le rapport (CLAUDE.md).
	const entete = $derived(
		data.nbBascules > 0
			? `${data.nbBascules} ticket${data.nbBascules > 1 ? 's ont' : ' a'} basculé : perdu${data.nbBascules > 1 ? 's' : ''} tel${data.nbBascules > 1 ? 's' : ''} quel${data.nbBascules > 1 ? 's' : ''}, gagnant${data.nbBascules > 1 ? 's' : ''} après retrait des paris trop justes.`
			: "Aujourd'hui, le retrait n'a fait basculer aucun ticket."
	);
</script>

<svelte:head>
	<title>Historique public — Muscle Ton Jeu</title>
	<meta
		name="description"
		content="Ce qui s'est passé : les tickets sauvés par le retrait des lignes trop justes, et ceux où ça n'a pas suffi. Ratés inclus."
	/>
</svelte:head>

<main class="container">
	<h1 class="t-h1">Historique public</h1>

	{#if data.sousLePlancher || data.exemples.length === 0}
		<!-- Sous le plancher (20 tickets réglés) : page vide et honnête. Un chiffre
		     bruité serait moins honnête qu'une page vide (CLAUDE.md). -->
		<div class="vide">
			<p class="t-body-lg">On n'a pas encore assez de tickets réglés pour montrer quoi que ce soit.</p>
			<p class="t-body measure">
				Cette page montrera ce qui s'est passé — les tickets sauvés par le retrait, et ceux où
				ça n'a pas suffi. Rien tant que le volume n'y est pas.
			</p>
		</div>
	{:else}
		<!-- 1 · L'en-tête : l'effet du retrait, au passé. -->
		<p class="t-body-lg entete">{entete}</p>
		<p class="t-body sous measure">Ce n'est pas un pronostic. On montre ce qui s'est passé.</p>

		<!-- 2 · Les exemples (toujours au moins un échec). -->
		<div class="exemples">
			{#each data.exemples as t (t.id)}
				<PublicTicketCard {t} />
			{/each}
		</div>

		<!-- 3 · Lien vers la liste complète — discret, mais présent. -->
		{#if data.nbDuJour > data.exemples.length}
			<a class="voir" href="/historique/jour">Voir les {data.nbDuJour} tickets du jour</a>
		{/if}
	{/if}

	<LegalNote />
</main>

<style>
	.container {
		max-width: var(--container-max);
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-10);
	}
	.entete {
		margin-top: var(--s-4);
		font-weight: 600;
	}
	.sous {
		color: var(--c-ink-3);
		margin-top: var(--s-2);
	}
	.measure {
		max-width: 62ch;
	}
	.vide {
		margin-top: var(--s-6);
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.exemples {
		margin-top: var(--s-6);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.voir {
		display: inline-flex;
		align-items: center;
		height: 44px;
		margin-top: var(--s-5);
		font-size: 15px;
		font-weight: 600;
		color: var(--c-ink-2);
	}
</style>
