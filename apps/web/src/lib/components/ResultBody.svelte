<script lang="ts">
	// Corps de l'écran de résultat — synthèse, explications, comparaison papier,
	// verdict, lecture match par match. EXTRAIT ici pour être rendu à l'IDENTIQUE par
	// /resultat (produit) ET /apercu (démo à données figées). Un seul composant : la
	// démo ne peut pas diverger du produit (c'est tout l'intérêt de /apercu).
	import PaperTicketCompare from '$lib/components/PaperTicketCompare.svelte';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import { ligneNote, resumeNonAnalyse, type RaisonNonAnalyse } from '$lib/lineStatus';
	import type { ResultVM } from '$lib/types';

	let { vm }: { vm: ResultVM } = $props();

	const resumeAutres = $derived(
		resumeNonAnalyse(
			vm.lignes
				.filter((l) => !l.analysable)
				.map((l) => l.raisonNonAnalyse)
				.filter((r): r is RaisonNonAnalyse => r != null)
		)
	);

	const paperLines = $derived(
		vm.lignes.map((l) => ({
			matchLabel: l.matchLabel,
			libelleFr: l.libelleFr,
			fragile: l.fragile,
			retiree: l.retiree,
			mentionNeutre: l.mentionNeutre,
			analysable: l.analysable
		}))
	);

	let showDetail = $state(false);
	const nbFragiles = $derived(vm.lignes.filter((l) => l.fragile).length);

	function pctBig(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
</script>

{#if vm.conflitMemeMatch}
	<p class="t-small conflit" role="note">
		Deux paris sont sur le même match : les chances affichées sont approximatives.
	</p>
{/if}

<!-- Niveau 1 : synthèse, une phrase sur le ticket entier. -->
<p class="t-body-lg analyse">{vm.synthese}</p>

<!-- Niveau 2 : une explication courte par sélection retirée. -->
{#if vm.explications.length > 0}
	<div class="explications">
		{#each vm.explications as e, i (e.ordre)}
			<article class="exp rvl-fade" class:badge={e.avecBadge} style="animation-delay:{i * 40}ms">
				<div class="exp-match">
					{e.matchLabel}{#if e.avecBadge}&nbsp;<span class="tri" aria-hidden="true">▲</span>{/if}
				</div>
				<div class="exp-marche" class:oc={e.avecBadge}>{e.libelleFr}</div>
				<p class="exp-texte">{e.texte}</p>
				{#if e.autresIssues.length > 0}
					<!-- Sur ce match : les paris les plus probables, curatés (max 2, hors double
					     chance, hors évidence). On MONTRE, jamais « joue ça » (règle d'or n°3). -->
					<div class="autres">
						<div class="autres-t">
							{e.chancesCotes
								? 'Sur ce match, d’après les cotes'
								: 'Sur ce match, voici ce que disent les chances'}
						</div>
						{#each e.autresIssues as iss (iss.libelleFr)}
							<div class="issue">
								<span>{iss.libelleFr}</span>
								<span class="issue-n">{pctBig(iss.probabilitePct)}</span>
							</div>
						{/each}
						{#if e.chancesCotes}
							<div class="autres-note">On n’a pas encore étudié ce championnat.</div>
						{/if}
					</div>
				{/if}
			</article>
		{/each}
	</div>
{/if}

<!-- Comparaison en tickets papier. -->
<div class="paper rvl-fade">
	<PaperTicketCompare
		lines={paperLines}
		probaTotalePct={vm.probaTotalePct}
		probaRenforceePct={vm.probaRenforceePct}
		single={vm.rienARetirer}
		masquerChances={vm.aucunAnalysable}
	/>
	{#if vm.nbAnalysables < vm.nbTotal && vm.nbAnalysables > 0}
		<p class="couverture t-small">
			<span class="cv-pct">{pctBig(vm.probaRenforceePct)}</span> — sur les {vm.nbAnalysables} match{vm.nbAnalysables
				> 1
				? 's'
				: ''} qu’on a pu lire.{resumeAutres ? ` ${resumeAutres}.` : ''} Ton ticket entier a moins de
			chances.
		</p>
	{/if}
</div>

<!-- Ligne de verdict. -->
<div class="verdict" aria-live="polite">
	{#if vm.aucunAnalysable}
		{#if resumeAutres}
			<div class="t-body">{resumeAutres}.</div>
		{/if}
		<p class="couvre t-body">
			On analyse le résultat du match, la double chance, le plus/moins de buts et les deux équipes
			marquent. Renvoie un ticket avec un de ces paris.
		</p>
		<p class="gratuit t-small">Ça ne t'a rien coûté.</p>
	{:else if !vm.rienARetirer}
		<div class="t-body-lg">
			{vm.nbRetirees} match{vm.nbRetirees > 1 ? 's' : ''} retiré{vm.nbRetirees > 1 ? 's' : ''}. Tes
			chances passent de <span class="v">{pctBig(vm.probaTotalePct)}</span> à
			<span class="v">{pctBig(vm.probaRenforceePct)}</span>{#if vm.multiplicateur}
				— <span class="mult">{vm.multiplicateur}</span> avec le ticket renforcé{/if}.
		</div>
		{#if vm.majoriteRetiree}
			<p class="serree t-body">
				On a retiré {vm.nbRetirees} de tes {vm.nbAnalysables} matchs. Ce qui reste est plus solide,
				mais c'est un ticket très différent du tien.
			</p>
		{/if}
	{:else if vm.toutesFragiles}
		<div class="t-body-lg">
			Toutes tes sélections sont trop justes. On ne peut pas alléger ce ticket sans le vider.
		</div>
		{#if vm.laPlusSerree}
			<div class="serree t-body">
				Ta sélection la plus serrée : {vm.laPlusSerree.matchLabel}, {vm.laPlusSerree.libelleFr} ({pctBig(
					vm.laPlusSerree.pct
				)})
			</div>
		{/if}
	{:else if vm.nbSerrees > 0}
		<!-- (b-serré) Rien à RETIRER, mais des lignes gardées restent serrées. -->
		<div class="serrees">
			{#each vm.lignes.filter((l) => l.serree) as l (l.ordre)}
				<div class="serre-line">
					<div class="serre-match">
						{l.matchLabel} — {l.libelleFr}{#if l.probabilitePct != null}&nbsp;<span class="serre-pct"
								>{pctBig(l.probabilitePct)}</span
							>{/if}
					</div>
					<div class="serre-note">On la garde, mais elle est juste au-dessus de notre barre.</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="t-body-lg">Ton ticket tient. Rien à retirer.</div>
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

<!-- Lecture détaillée du ticket : match par match, repliée par défaut. -->
<section class="detail">
	<button
		class="disclosure"
		type="button"
		aria-expanded={showDetail}
		onclick={() => (showDetail = !showDetail)}
	>
		<span>Lecture détaillée du ticket</span>
		<span class="chev" aria-hidden="true">{showDetail ? '▾' : '▸'}</span>
	</button>

	{#if showDetail}
		<div class="mpm">
			<div class="mpm-head">
				<span class="mpm-titre">Match par match</span>
				{#if nbFragiles > 0}
					<span class="mpm-badge">{nbFragiles} trop juste{nbFragiles > 1 ? 's' : ''}</span>
				{/if}
			</div>
			{#each vm.lignes as l, i (l.ordre)}
				<article
					class="mpm-card rvl-fade"
					class:fragile={l.fragile}
					class:removed={l.retiree}
					class:serree={l.serree}
					style="animation-delay:{i * 40}ms"
				>
					<div class="mpm-top">
						<span class="mpm-match">
							{l.matchLabel}{#if l.fragile}&nbsp;<span class="tri">▲</span>{/if}{#if l.serree}&nbsp;<span
									class="serre-tag">serré</span
								>{/if}
						</span>
						{#if l.analysable && l.probabilitePct != null}
							<span class="mpm-pct">{pctBig(l.probabilitePct)}</span>
						{:else}
							<span class="mpm-na">pas d’avis</span>
						{/if}
					</div>
					<div class="mpm-marche" class:oc={l.fragile}>{l.libelleFr}</div>
					<div class="mpm-note">{ligneNote(l, { retraitUnique: vm.nbRetirees === 1 })}</div>
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
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

	.mult {
		color: var(--c-ocre);
		font-weight: 600;
		white-space: nowrap;
	}

	/* Sur ce match : ce que disent les chances — secondaire, sobre, subordonné. */
	.autres {
		margin-top: var(--s-3);
		padding-top: var(--s-3);
		border-top: 1px dashed var(--c-line);
	}
	.autres-t {
		font-size: 12px;
		color: var(--c-ink-mute);
		margin-bottom: var(--s-2);
	}
	.issue {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--s-3);
		padding: 3px 0;
		font-size: 13px;
		color: var(--c-ink-3);
	}
	.issue-n {
		font-family: var(--font-mono);
		color: var(--c-ink-2);
		font-feature-settings: 'tnum' 1;
	}
	.autres-note {
		margin-top: var(--s-2);
		font-size: 12px;
		color: var(--c-ink-mute);
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
	/* Ligne la plus serrée (info neutre du verdict) : ton discret, aucun accent. */
	.serree {
		margin-top: var(--s-2);
		color: var(--c-ink-2);
		font-feature-settings: 'tnum' 1;
	}
	.couverture {
		margin: var(--s-3) 0 0;
		color: var(--c-ink-2);
		max-width: var(--measure);
	}
	.couverture .cv-pct {
		font-weight: 600;
		font-feature-settings: 'tnum' 1;
	}

	/* Lignes serrées développées (verdict) : NEUTRE, jamais l'ocre du fragile. */
	.serrees {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		margin-top: var(--s-2);
	}
	.serre-line {
		padding: var(--s-3) var(--s-4);
		border: 1px solid var(--c-line);
		border-left: 3px solid var(--c-line-strong);
		border-radius: var(--r-sm);
		background: var(--c-surface);
	}
	.serre-match {
		font-weight: 600;
	}
	.serre-pct {
		font-variant-numeric: tabular-nums;
		color: var(--c-ink-2);
	}
	.serre-note {
		color: var(--c-ink-2);
		font-size: 0.9em;
		margin-top: 2px;
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
	/* « serré » : marqueur NEUTRE (gris), jamais l'ocre du fragile ni le barré du retiré. */
	.mpm-card.serree {
		border-left: 3px solid var(--c-line-strong);
	}
	.serre-tag {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--c-ink-3);
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line);
		border-radius: 999px;
		padding: 1px 7px;
		vertical-align: middle;
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
