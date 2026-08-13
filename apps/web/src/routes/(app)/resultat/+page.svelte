<script lang="ts">
	// Écran de résultat. La comparaison « Ton ticket » / « Ton ticket renforcé »
	// est en vue PAPIER (même langage que la landing) ; tout le reste est conservé :
	// analyse, verdict, lecture détaillée match par match, partage, recharge,
	// notifications, bandeau d'historique.
	import type { PageData, ActionData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import HistoryMarquee from '$lib/components/HistoryMarquee.svelte';
	import PaperTicketCompare from '$lib/components/PaperTicketCompare.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const vm = $derived(data.vm);

	function pctBig(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}

	const analysables = $derived(vm.lignes.filter((l) => l.analysable));
	const paperLines = $derived(
		analysables.map((l) => ({
			matchLabel: l.matchLabel,
			libelleFr: l.libelleFr,
			fragile: l.fragile,
			retiree: l.retiree
		}))
	);

	// Lecture détaillée du coupon : match par match, repliée par défaut.
	let showDetail = $state(false);
	const nbFragiles = $derived(vm.lignes.filter((l) => l.fragile).length);

	/** Note factuelle par ligne : déterministe, jamais une phrase inventée. */
	function ligneNote(l: (typeof vm.lignes)[number]): string {
		if (!l.analysable) return 'Marché non couvert — non analysé, non facturé.';
		if (l.retiree) return 'Retirée du ticket renforcé — sélection la plus fragile.';
		if (l.fragile) return 'Sélection fragile — probabilité sous le seuil.';
		return 'Sélection solide.';
	}
</script>

<svelte:head><title>Ton ticket, lu — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<div class="tete">
		<h1 class="t-h1">Ton ticket, lu</h1>
		{#if data.gratuit}<span class="offert t-small">Offert</span>{/if}
	</div>

	{#if vm.conflitMemeMatch}
		<p class="t-small conflit" role="note">
			Deux sélections portent sur le même match. La probabilité combinée est approchée.
		</p>
	{/if}

	<p class="t-body-lg analyse">{vm.texte}</p>

	<!-- Comparaison en tickets papier -->
	<div class="paper rvl-fade">
		<PaperTicketCompare
			lines={paperLines}
			probaTotalePct={vm.probaTotalePct}
			probaRenforceePct={vm.probaRenforceePct}
		/>
	</div>

	<!-- Ligne de verdict -->
	<div class="verdict" aria-live="polite">
		{#if vm.rienARetirer}
			<div class="t-body-lg">Rien à retirer. Ton ticket tient debout.</div>
		{:else}
			<div class="t-body-lg">
				{vm.nbRetirees} match{vm.nbRetirees > 1 ? 's' : ''} retiré{vm.nbRetirees > 1 ? 's' : ''}.
				Tes chances passent de <span class="v">{pctBig(vm.probaTotalePct)}</span> à
				<span class="v">{pctBig(vm.probaRenforceePct)}</span>.
			</div>
		{/if}
		<LegalNote />
	</div>

	<!-- Lecture détaillée du coupon : match par match, repliée par défaut. Les
	     probabilités par ligne viennent de la table, les notes sont factuelles. -->
	<section class="detail">
		<button
			class="disclosure"
			type="button"
			aria-expanded={showDetail}
			onclick={() => (showDetail = !showDetail)}
		>
			<span>Lecture détaillée du coupon</span>
			<span class="chev" aria-hidden="true">{showDetail ? '▾' : '▸'}</span>
		</button>

		{#if showDetail}
			<div class="mpm">
				<div class="mpm-head">
					<span class="mpm-titre">Match par match</span>
					{#if nbFragiles > 0}
						<span class="mpm-badge">{nbFragiles} fragile{nbFragiles > 1 ? 's' : ''}</span>
					{/if}
				</div>
				{#each vm.lignes as l, i (l.ordre)}
					<article
						class="mpm-card rvl-fade"
						class:fragile={l.fragile}
						class:removed={l.retiree}
						style="animation-delay:{i * 40}ms"
					>
						<div class="mpm-top">
							<span class="mpm-match">
								{l.matchLabel}{#if l.fragile}&nbsp;<span class="tri">▲</span>{/if}
							</span>
							{#if l.analysable && l.probabilitePct != null}
								<span class="mpm-pct">{pctBig(l.probabilitePct)}</span>
							{:else}
								<span class="mpm-na">non analysé</span>
							{/if}
						</div>
						<div class="mpm-marche" class:oc={l.fragile}>{l.libelleFr}</div>
						<div class="mpm-note">{ligneNote(l)}</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Actions : une seule action accent (Partager) ; relancer une analyse est
	     une progression neutre (bouton sombre). Plus de « modifier » : l'analyse
	     est faite. « Analyser un autre ticket » suit la logique de facturation
	     habituelle (gratuit si éligible, sinon crédits, sinon blocage à l'affichage). -->
	<div class="actions">
		<a class="btn-primary" href={`/partage/${data.ticketId}`} target="_blank" rel="noopener">
			Partager
		</a>
		<a class="btn-dark" href="/analyser">Analyser un autre ticket</a>
	</div>

	{#if data.montreRecharge}
		<!-- Invitation à recharger : après l'analyse offerte, sans pression avant. -->
		<div class="recharge-invite">
			<p class="t-body">Pour continuer à muscler tes tickets, recharge à partir de 500 F.</p>
			<a class="btn-outline" href="/recharge">Recharger</a>
		</div>
	{/if}

	<!-- Rétention : opt-in notifications (PRD §10) -->
	<div class="notif">
		{#if form?.notifie}
			<p class="t-body ok">On te prévient quand ton ticket est joué.</p>
		{:else}
			<form method="POST" action="?/notifier">
				<p class="t-body texte">On te prévient quand ton ticket est joué ?</p>
				<button class="btn-outline" type="submit">Activer les notifications</button>
			</form>
		{/if}
	</div>

	{#if data.historique.length >= 20}
		<!-- Bandeau d'historique réel : sélections marquées, matchs terminés, issue
		     réelle (les défavorables comprises). Absent tant qu'il y a moins de 20
		     résultats en base — jamais de remplissage de démonstration. -->
		<HistoryMarquee items={data.historique} />
	{/if}
</main>

<style>
	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.tete {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.tete h1 {
		margin: 0;
	}
	.offert {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		color: var(--c-ink-3);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}
	.conflit {
		color: var(--c-ocre);
		margin: 0;
	}
	.analyse {
		color: var(--c-ink-2);
		margin: 0;
		max-width: var(--measure);
	}
	.paper {
		padding: var(--s-2) 0;
	}

	.verdict {
		background: var(--c-accent-wash);
		border: 1px solid var(--c-accent-line);
		border-radius: var(--r-md);
		padding: var(--s-5) var(--s-4);
	}
	.verdict .t-body-lg {
		color: var(--c-ink);
	}
	.verdict .v {
		font-weight: 600;
		font-feature-settings: 'tnum' 1;
	}

	/* ---- Lecture détaillée (match par match) ---- */
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.disclosure {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
		width: 100%;
		height: 52px;
		padding: 0 var(--s-5);
		background: transparent;
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-pill);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		color: var(--c-ink);
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.disclosure:active {
		transform: scale(0.98);
	}
	.disclosure .chev {
		color: var(--c-ink-3);
		font-size: 14px;
	}
	.mpm {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.mpm-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
	}
	.mpm-titre {
		font-family: var(--font-title);
		font-size: 24px;
		line-height: 1.05;
		letter-spacing: -0.5px;
		text-transform: uppercase;
		color: var(--c-ink);
	}
	.mpm-badge {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-ocre-wash);
		border: 1px solid var(--c-ocre-line);
		color: var(--c-ocre);
		font-size: 14px;
		font-weight: 600;
	}
	.mpm-card {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.mpm-card.fragile {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.mpm-card.removed {
		background: var(--c-canvas-sunk);
	}
	.mpm-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.mpm-match {
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	.mpm-match .tri {
		color: var(--c-ocre);
		font-size: 13px;
	}
	.mpm-pct {
		flex: 0 0 auto;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 22px;
		letter-spacing: -0.4px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.mpm-na {
		flex: 0 0 auto;
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.mpm-marche {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.mpm-marche.oc {
		color: var(--c-ocre);
	}
	.mpm-note {
		font-size: 14px;
		color: var(--c-ink-3);
	}

	/* ---- Actions ---- */
	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.btn-dark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		text-decoration: none;
		transition: transform 100ms ease-out;
	}
	.btn-dark:active {
		transform: scale(0.98);
	}
	@media (min-width: 600px) {
		.actions {
			flex-direction: row;
		}
		.actions .btn-primary,
		.actions .btn-dark {
			flex: 1;
		}
	}
	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		font-weight: 600;
		text-decoration: none;
		transition: transform 100ms ease-out;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.recharge-invite {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		align-items: flex-start;
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.recharge-invite .t-body {
		color: var(--c-ink-2);
		margin: 0;
	}
	.notif {
		padding-top: var(--s-4);
		border-top: 1px solid var(--c-line);
	}
	.notif .texte {
		color: var(--c-ink-2);
		margin: 0 0 var(--s-3);
	}
	.notif .ok {
		color: var(--c-ink-2);
		margin: 0;
	}
	.btn-outline {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 52px;
		padding: 0 var(--s-6);
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--c-ink);
		border: 1px solid var(--c-line-strong);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.btn-outline:active {
		transform: scale(0.98);
	}

	/* ---- Révélation sobre (opacity uniquement) ---- */
	.rvl-fade {
		opacity: 0;
		animation: rvl-fade 220ms ease-out both;
	}
	@keyframes rvl-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rvl-fade {
			opacity: 1;
			animation: none;
		}
	}
</style>
