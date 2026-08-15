<script lang="ts">
	// Écran de résultat. La comparaison « Ton ticket » / « Ton ticket renforcé »
	// est en vue PAPIER (même langage que la landing) ; tout le reste est conservé :
	// analyse, verdict, lecture détaillée match par match, partage, recharge,
	// notifications, bandeau d'historique.
	import type { PageData, ActionData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import HistoryMarquee from '$lib/components/HistoryMarquee.svelte';
	import PaperTicketCompare from '$lib/components/PaperTicketCompare.svelte';
	import ShareSheet from '$lib/components/ShareSheet.svelte';
	import { ligneNote, resumeNonAnalyse, type RaisonNonAnalyse } from '$lib/lineStatus';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const vm = $derived(data.vm);

	// Résumé HONNÊTE des lignes non analysées : la vraie raison, jamais « non couvert »
	// par défaut. Une cause → message précis ; plusieurs → compte neutre.
	const resumeAutres = $derived(
		resumeNonAnalyse(
			vm.lignes
				.filter((l) => !l.analysable)
				.map((l) => l.raisonNonAnalyse)
				.filter((r): r is RaisonNonAnalyse => r != null)
		)
	);

	let shareOpen = $state(false);

	function pctBig(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}

	/** « il y a 5 min », « il y a 1 h », « il y a 2 j » — durée depuis l'analyse. */
	function ilYa(ms: number): string {
		const min = Math.round(Math.max(0, Date.now() - ms) / 60000);
		if (min < 1) return "à l'instant";
		if (min < 60) return `il y a ${min} min`;
		const h = Math.round(min / 60);
		if (h < 24) return `il y a ${h} h`;
		return `il y a ${Math.round(h / 24)} j`;
	}

	// Toutes les lignes, y compris les non analysées : elles restent dans les deux
	// tickets (jamais retirées), affichées neutres avec la mention « non analysé ».
	// « analysable » côté papier = réellement analysée (résolue ET avec proba).
	const paperLines = $derived(
		vm.lignes.map((l) => ({
			matchLabel: l.matchLabel,
			libelleFr: l.libelleFr,
			fragile: l.fragile,
			retiree: l.retiree,
			mentionNeutre: l.mentionNeutre,
			// Booléen déjà tranché côté serveur (règle unique isAnalysable) — on le lit.
			analysable: l.analysable
		}))
	);

	// Lecture détaillée du coupon : match par match, repliée par défaut.
	let showDetail = $state(false);
	const nbFragiles = $derived(vm.lignes.filter((l) => l.fragile).length);
</script>

<svelte:head><title>Ton ticket, lu — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<div class="tete">
		<h1 class="t-h1">Ton ticket, lu</h1>
		{#if data.gratuit}<span class="offert t-small">Offert</span>{/if}
	</div>

	{#if data.reutilise}
		<!-- Réutilisation VISIBLE : même capture déjà analysée, non refacturée. Le
		     piège qui coûtait du temps — on le dit, avec une sortie claire. -->
		<div class="reutilise" role="note">
			<p class="t-body">
				Tu as déjà analysé ce ticket {ilYa(data.analyseLeMs)}. Voici ton résultat, il n'est pas
				refacturé.
			</p>
			<a class="btn-outline" href="/analyser">Analyser une autre capture</a>
		</div>
	{/if}

	{#if vm.conflitMemeMatch}
		<p class="t-small conflit" role="note">
			Deux sélections portent sur le même match. La probabilité combinée est approchée.
		</p>
	{/if}

	<!-- Niveau 1 : synthèse, une phrase sur le ticket entier. -->
	<p class="t-body-lg analyse">{vm.synthese}</p>

	<!-- Niveau 2 : une explication courte par sélection retirée. Visible sans
	     déplier — c'est ce que le lecteur doit comprendre en dix secondes. -->
	{#if vm.explications.length > 0}
		<div class="explications">
			{#each vm.explications as e, i (e.ordre)}
				<article class="exp rvl-fade" class:badge={e.avecBadge} style="animation-delay:{i * 40}ms">
					<div class="exp-match">
						{e.matchLabel}{#if e.avecBadge}&nbsp;<span class="tri" aria-hidden="true">▲</span>{/if}
					</div>
					<div class="exp-marche" class:oc={e.avecBadge}>{e.libelleFr}</div>
					<p class="exp-texte">{e.texte}</p>
				</article>
			{/each}
		</div>
	{/if}

	<!-- Comparaison en tickets papier. Un seul ticket quand rien n'est retiré :
	     le renforcé serait identique à l'original, un doublon n'apporte rien. -->
	<div class="paper rvl-fade">
		<PaperTicketCompare
			lines={paperLines}
			probaTotalePct={vm.probaTotalePct}
			probaRenforceePct={vm.probaRenforceePct}
			single={vm.rienARetirer}
		/>
		<!-- Le pourcentage ne porte QUE sur les matchs analysés. Quand une partie du
		     ticket n'est pas couverte, on le dit : sinon le chiffre laisserait croire
		     qu'il couvre tout le ticket. On ne retire jamais les lignes non analysées. -->
		{#if vm.nbAnalysables < vm.nbTotal && vm.nbAnalysables > 0}
			<p class="couverture t-small">
				<span class="cv-pct">{pctBig(vm.probaRenforceePct)}</span> — sur les {vm.nbAnalysables} match{vm.nbAnalysables
					> 1
					? 's'
					: ''} analysé{vm.nbAnalysables > 1 ? 's' : ''}.{#if resumeAutres}
					{resumeAutres}.{/if} Ton ticket entier a moins de chances.
			</p>
		{/if}
	</div>

	<!-- Ligne de verdict — TROIS cas distincts, jamais « tient debout » à tort. -->
	<div class="verdict" aria-live="polite">
		{#if !vm.rienARetirer}
			<!-- (a) Retrait effectué : la comparaison des chances. -->
			<div class="t-body-lg">
				{vm.nbRetirees} match{vm.nbRetirees > 1 ? 's' : ''} retiré{vm.nbRetirees > 1 ? 's' : ''}.
				Tes chances passent de <span class="v">{pctBig(vm.probaTotalePct)}</span> à
				<span class="v">{pctBig(vm.probaRenforceePct)}</span>.
			</div>
		{:else if vm.retraitBloqueParPlancher}
			<!-- (c) Fragile MAIS retrait bloqué par le plancher : on le DIT, jamais
			     « tient debout ». La ligne la plus serrée est le pari fragile lui-même. -->
			<div class="t-body-lg">
				On ne peut pas alléger ce ticket : il ne reste pas assez de matchs analysés.
			</div>
			{#if vm.laPlusSerree}
				<div class="serree t-body">
					Ta sélection la plus serrée : {vm.laPlusSerree.matchLabel}, {vm.laPlusSerree.libelleFr} ({pctBig(
						vm.laPlusSerree.pct
					)})
				</div>
			{/if}
		{:else}
			<!-- (b) Rien de fragile : le ticket tient vraiment. Info NEUTRE (la plus
			     serrée) seulement avec ≥ 2 lignes analysables — sinon elle n'a pas de sens. -->
			<div class="t-body-lg">Rien à retirer. Ton ticket tient debout.</div>
			{#if vm.laPlusSerree && vm.nbAnalysables >= 2}
				<div class="serree t-body">
					Ta sélection la plus serrée : {vm.laPlusSerree.matchLabel}, {vm.laPlusSerree.libelleFr} ({pctBig(
						vm.laPlusSerree.pct
					)})
				</div>
			{/if}
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
							<!-- l.analysable (règle unique) implique déjà probabilitePct != null ;
							     le second test reste un garde-fou d'affichage inoffensif. -->
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
		<button class="btn-primary" type="button" onclick={() => (shareOpen = true)}>Partager</button>
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

{#if shareOpen}
	<ShareSheet imageUrl={data.shareImage} shareUrl={data.shareUrl} onClose={() => (shareOpen = false)} />
{/if}

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

	/* ---- Explications par sélection retirée (niveau 2) ---- */
	.explications {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.exp {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.exp.badge {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.exp-match {
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	.exp-match .tri {
		color: var(--c-ocre);
		font-size: 13px;
	}
	.exp-marche {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.exp-marche.oc {
		color: var(--c-ocre);
	}
	.exp-texte {
		margin: var(--s-1) 0 0;
		font-size: 15px;
		line-height: 1.45;
		color: var(--c-ink);
		max-width: var(--measure);
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
	/* Ligne la plus serrée : info neutre, pas une alerte. Ton discret, aucun accent
	   de couleur, aucun poids d'insistance — c'est un fait, pas un conseil. */
	.serree {
		margin-top: var(--s-2);
		color: var(--c-ink-2);
		font-feature-settings: 'tnum' 1;
	}
	/* Mention de couverture : le pourcentage ne porte que sur les matchs analysés.
	   Neutre, sous le bloc de tickets, sans dramatiser. */
	.couverture {
		margin: var(--s-3) 0 0;
		color: var(--c-ink-2);
		max-width: var(--measure);
	}
	.couverture .cv-pct {
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
		border: none;
		border-radius: var(--r-pill);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		text-decoration: none;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.reutilise {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		align-items: flex-start;
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.reutilise .t-body {
		margin: 0;
		color: var(--c-ink-2);
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
