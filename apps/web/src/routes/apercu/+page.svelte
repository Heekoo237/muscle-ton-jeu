<script lang="ts">
	// Aperçu du rendu : un ticket de DÉMONSTRATION avec des retraits, pour vérifier
	// que la colonne « renforcé » barre bien les lignes retirées (rature + « retiré »)
	// et affiche correctement une ligne non analysée. Aucune donnée réelle.
	import PaperTicketCompare from '$lib/components/PaperTicketCompare.svelte';
	import { ligneNote } from '$lib/lineStatus';

	// Un jeu de lignes qui couvre TOUS les cas d'affichage :
	//  - 2 fragiles retirées (badge rouge + rature + « retiré »)
	//  - 1 retirée sans badge (mention neutre + rature + « retiré »)
	//  - 1 non analysée (« non analysé », neutre, jamais barrée)
	//  - 2 solides
	const lignes = [
		{ ordre: 1, matchLabel: 'Arsenal – Liverpool', libelleFr: 'Arsenal ou match nul', fragile: false, retiree: false, mentionNeutre: false, analysable: true, probabilitePct: 71.2 },
		{ ordre: 2, matchLabel: 'Marseille – Lyon', libelleFr: 'Plus de 2,5 buts', fragile: true, retiree: true, mentionNeutre: false, analysable: true, probabilitePct: 41.3 },
		{ ordre: 3, matchLabel: 'Napoli – Roma', libelleFr: 'Napoli gagne', fragile: true, retiree: true, mentionNeutre: false, analysable: true, probabilitePct: 45.0 },
		{ ordre: 4, matchLabel: 'Bayern – Dortmund', libelleFr: 'Les deux marquent', fragile: false, retiree: false, mentionNeutre: false, analysable: true, probabilitePct: 58.4 },
		{ ordre: 5, matchLabel: 'Monaco – Lille', libelleFr: 'Monaco ou match nul', fragile: false, retiree: true, mentionNeutre: true, analysable: true, probabilitePct: 52.0 },
		{ ordre: 6, matchLabel: 'Klaksvik – Lech Poznan', libelleFr: 'Plus de 1,5 buts', fragile: false, retiree: false, mentionNeutre: false, analysable: false, probabilitePct: null }
	];

	const paperLines = lignes.map((l) => ({
		matchLabel: l.matchLabel,
		libelleFr: l.libelleFr,
		fragile: l.fragile,
		retiree: l.retiree,
		mentionNeutre: l.mentionNeutre,
		analysable: l.analysable
	}));

	function pctBig(v: number | null): string {
		return v == null ? 'non analysé' : `${v.toString().replace('.', ',')} %`;
	}
</script>

<svelte:head><title>Aperçu du rendu — Muscle Ton Jeu</title></svelte:head>

<main class="wrap">
	<p class="badge">Aperçu — démonstration du rendu, pas un vrai ticket</p>
	<h1 class="t-h1">Ton ticket, lu</h1>
	<p class="t-body sous">
		Regarde la colonne <strong>« Ton ticket renforcé »</strong> : les lignes retirées sont
		<strong>barrées</strong> avec l'étiquette <strong>« retiré »</strong>. Sur téléphone, le renforcé
		est le ticket du bas.
	</p>

	<PaperTicketCompare lines={paperLines} probaTotalePct={3.9} probaRenforceePct={11.8} />

	<section class="mpm">
		<h2 class="t-h2">Match par match</h2>
		{#each lignes as l (l.ordre)}
			<article class="card" class:fragile={l.fragile} class:removed={l.retiree}>
				<div class="top">
					<span class="match">{l.matchLabel}{#if l.fragile}&nbsp;<span class="tri">▲</span>{/if}</span>
					<span class="pct" class:na={l.probabilitePct == null}>{pctBig(l.probabilitePct)}</span>
				</div>
				<div class="marche">{l.libelleFr}</div>
				<div class="note">{ligneNote(l)}</div>
			</article>
		{/each}
	</section>

	<a class="btn-dark" href="/">Retour à l'accueil</a>
</main>

<style>
	.wrap {
		max-width: 960px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.badge {
		align-self: flex-start;
		padding: 2px 10px;
		border-radius: var(--r-pill);
		background: var(--c-ocre-wash);
		border: 1px solid var(--c-ocre-line);
		color: var(--c-ocre);
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin: 0;
	}
	h1 {
		margin: 0;
	}
	.sous {
		color: var(--c-ink-2);
		margin: 0;
		max-width: var(--measure);
	}
	.mpm {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.mpm h2 {
		margin: 0;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.card.fragile {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.card.removed {
		background: var(--c-canvas-sunk);
	}
	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.match {
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	.tri {
		color: var(--c-ocre);
		font-size: 13px;
	}
	.pct {
		font-weight: 600;
		font-size: 20px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.pct.na {
		font-size: 14px;
		font-weight: 400;
		color: var(--c-ink-3);
	}
	.marche {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.note {
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.btn-dark {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		height: 48px;
		padding: 0 var(--s-6);
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-weight: 600;
		text-decoration: none;
	}
</style>
