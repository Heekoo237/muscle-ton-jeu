<script lang="ts">
	// Écran de résultat — module de comparaison EMPILÉ (maquette ui-screens ÉCRAN 3).
	// Bandeau collant avec les deux %, puis « Ton ticket » (E2) et « Ton ticket
	// renforcé » (E3) en listes de lignes 64 px, chaque bloc terminé par son
	// chiffre-xl. Le module papier côte à côte est réservé à la landing.
	import type { PageData, ActionData } from './$types';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import HistoryMarquee from '$lib/components/HistoryMarquee.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const vm = $derived(data.vm);

	let onlyChanges = $state(false);

	function pctBig(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
	function cote(v: number): string {
		return v.toFixed(2).replace('.', ',');
	}
	/** Cote totale = produit des cotes fournies. */
	function coteTotale(lignes: { cote: number | null }[]): string {
		const p = lignes.reduce((acc, l) => acc * (l.cote ?? 1), 1);
		return cote(p);
	}

	const analysables = $derived(vm.lignes.filter((l) => l.analysable));
	const gardees = $derived(analysables.filter((l) => !l.retiree));
	const gaucheVisible = $derived(onlyChanges ? analysables.filter((l) => l.fragile) : analysables);
	const droiteVisible = $derived(onlyChanges ? analysables.filter((l) => l.retiree) : analysables);
	const inchangees = $derived(analysables.filter((l) => !l.fragile && !l.retiree).length);

	// Révélation sobre, une fois, moins de 1,2 s (CSS pur, jeu de délais) :
	// ticket gauche → ses lignes en cascade → son chiffre → ticket droit → traits
	// sur les retirées → le chiffre accent en dernier. Les chiffres apparaissent,
	// ils ne s'animent pas. Aucun compteur, aucun rebond, aucune célébration.
	const STEP = 40; // ms entre deux lignes
	const nL = $derived(gaucheVisible.length);
	const nR = $derived(droiteVisible.length);
	const dLeftPct = $derived(140 + nL * STEP + 40);
	const dRightBase = $derived(dLeftPct + 140);
	const dRightPct = $derived(dRightBase + nR * STEP + 60);
	const leftRowDelay = (i: number) => 140 + i * STEP;
	const rightRowDelay = (i: number) => dRightBase + i * STEP;
</script>

<svelte:head><title>Ton ticket, lu — Muscle Ton Jeu</title></svelte:head>

<!-- Bandeau collant : les deux % visibles à tout moment du scroll (§8.4) -->
<div class="compare-sticky">
	<span class="p ink">{pctBig(vm.probaTotalePct)}</span>
	<span class="arrow">→</span>
	<span class="p accent">{pctBig(vm.probaRenforceePct)}</span>
</div>

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

	<button class="chip" type="button" onclick={() => (onlyChanges = !onlyChanges)}>
		{onlyChanges ? 'Voir tout le ticket' : 'Voir seulement ce qui change'}
	</button>

	<!-- BLOC 1 — TON TICKET (E2) -->
	<section class="bloc e2 rvl-fade" style="animation-delay:60ms">
		<header class="bloc-head">
			<span class="titre">Ton ticket</span>
			<span class="compte">{analysables.length} sélections</span>
		</header>
		{#each gaucheVisible as l, i (l.ordre)}
			<div class="row rvl" class:fragile={l.fragile} style="animation-delay:{leftRowDelay(i)}ms">
				<span class="idx">{l.index}</span>
				<div class="mid">
					<div class="match">{l.matchLabel}</div>
					<div class="marche" class:oc={l.fragile}>
						{#if l.fragile}<span class="tri">▲</span>{/if}{l.libelleFr}{l.fragile ? ' · fragile' : ''}
					</div>
				</div>
				{#if l.cote != null}<span class="cote">{cote(l.cote)}</span>{/if}
			</div>
		{/each}
		{#if onlyChanges && inchangees > 0}
			<div class="inchange">{inchangees} sélections inchangées</div>
		{/if}
		<div class="pied rvl-fade" style="animation-delay:{dLeftPct}ms">
			<div class="xl ink">{pctBig(vm.probaTotalePct)}</div>
			<div class="sous">chances que le ticket passe · cote {coteTotale(analysables)}</div>
		</div>
	</section>

	<!-- BLOC 2 — TON TICKET RENFORCÉ (E3) -->
	<section class="bloc e3 rvl-fade" style="animation-delay:{dRightBase - 40}ms">
		<header class="bloc-head">
			<span class="titre">Ton ticket renforcé</span>
			<span class="compte">{gardees.length} sélections</span>
		</header>
		{#each droiteVisible as l, i (l.ordre)}
			<div class="row rvl" class:removed={l.retiree} style="animation-delay:{rightRowDelay(i)}ms">
				<span class="idx">{l.index}</span>
				<div class="mid">
					<div class="match" class:strike={l.retiree}>
						{l.matchLabel}
						{#if l.retiree}
							<span class="trace" style="animation-delay:{rightRowDelay(i) + 120}ms"></span>
						{/if}
					</div>
					<div class="marche" class:strike={l.retiree}>{l.libelleFr}</div>
				</div>
				{#if l.retiree}
					<span class="badge">retiré</span>
				{:else if l.cote != null}
					<span class="cote">{cote(l.cote)}</span>
				{/if}
			</div>
		{/each}
		{#if onlyChanges && inchangees > 0}
			<div class="inchange">{inchangees} sélections inchangées</div>
		{/if}
		<div class="pied rvl-fade" style="animation-delay:{dRightPct}ms">
			<div class="xl accent">{pctBig(vm.probaRenforceePct)}</div>
			<div class="sous">chances que le ticket passe · cote {coteTotale(gardees)}</div>
		</div>
	</section>

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

	<p class="t-body analyse">{vm.texte}</p>

	<a class="btn-primary" href={`/partage/${data.ticketId}`} target="_blank" rel="noopener">Partager</a>

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
	.compare-sticky {
		position: sticky;
		top: 60px;
		z-index: 15;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		background: var(--c-canvas-sunk);
		border-bottom: 1px solid var(--c-line);
	}
	.compare-sticky .p {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 22px;
		letter-spacing: -0.4px;
		font-feature-settings: 'tnum' 1;
	}
	.compare-sticky .ink {
		color: var(--c-ink);
	}
	.compare-sticky .accent {
		color: var(--c-accent);
	}
	.compare-sticky .arrow {
		color: var(--c-ink-3);
		font-size: 16px;
	}

	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
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

	.chip {
		align-self: flex-start;
		height: 48px;
		padding: 0 var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-pill);
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
		cursor: pointer;
	}

	.bloc {
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-lg);
		overflow: hidden;
	}
	.bloc.e3 {
		border-color: var(--c-line-strong);
		border-top: 3px solid var(--c-accent-line);
	}
	.bloc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		height: 44px;
		padding: 0 var(--s-4);
		background: var(--c-canvas-sunk);
		border-bottom: 1px solid var(--c-line);
	}
	.bloc-head .titre {
		font-family: var(--font-body);
		font-size: 18px;
		font-weight: 600;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		color: var(--c-ink);
	}
	.bloc-head .compte {
		font-size: 14px;
		color: var(--c-ink-3);
		font-feature-settings: 'tnum' 1;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		height: 64px;
		padding: 0 var(--s-4);
		border-bottom: 1px solid var(--c-line);
		box-sizing: border-box;
	}
	.row.fragile {
		background: var(--c-ocre-wash);
		border-left: 3px solid var(--c-ocre);
	}
	.row.removed {
		background: var(--c-canvas-sunk);
	}
	.idx {
		flex: 0 0 24px;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink-3);
	}
	.mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.match {
		position: relative;
		font-size: 16px;
		color: var(--c-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.marche {
		font-size: 14px;
		color: var(--c-ink-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.marche.oc {
		color: var(--c-ocre);
	}
	.tri {
		flex: 0 0 auto;
		line-height: 1;
		font-size: 13px;
	}
	/* Le match retiré est barré par un trait qui se trace (voir .trace) ;
	   le marché garde son barré statique, toujours lisible (repli mouvement réduit). */
	.match.strike {
		color: var(--c-ink-3);
	}
	.marche.strike {
		color: var(--c-ink-3);
		text-decoration: line-through;
	}
	.trace {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: var(--c-ink-3);
		transform: scaleX(0);
		transform-origin: left center;
		animation: trace-draw 200ms ease-out both;
	}
	.cote {
		flex: 0 0 56px;
		text-align: right;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.badge {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		background: var(--c-canvas);
		border-radius: var(--r-pill);
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.inchange {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 48px;
		background: var(--c-canvas-sunk);
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.pied {
		padding: var(--s-5) var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
	}
	.xl {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 52px;
		line-height: 1;
		letter-spacing: -1.5px;
		font-feature-settings: 'tnum' 1;
	}
	.xl.ink {
		color: var(--c-ink);
	}
	.xl.accent {
		color: var(--c-accent);
	}
	.sous {
		font-size: 14px;
		color: var(--c-ink-3);
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
	.analyse {
		color: var(--c-ink-2);
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
	.chip {
		transition: transform 100ms ease-out;
	}
	.chip:active {
		transform: scale(0.98);
	}

	/* ---- Révélation sobre (CSS pur, une passe) ----
	   Uniquement opacity et transform. Les blocs et les chiffres fondent (aucun
	   déplacement des chiffres) ; les lignes montent d'un cheveu en cascade. */
	.rvl {
		opacity: 0;
		animation: rvl-in 220ms ease-out both;
	}
	.rvl-fade {
		opacity: 0;
		animation: rvl-fade 220ms ease-out both;
	}
	@keyframes rvl-in {
		from {
			opacity: 0;
			transform: translateY(5px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@keyframes rvl-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes trace-draw {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	/* Mouvement réduit : tout est déjà en place, rien ne bouge, rien ne s'étale.
	   Les traits sont tracés (fin d'animation), les blocs et lignes sont visibles. */
	@media (prefers-reduced-motion: reduce) {
		.rvl,
		.rvl-fade {
			opacity: 1;
			animation: none;
		}
		.trace {
			transform: scaleX(1);
			animation: none;
		}
	}
</style>
