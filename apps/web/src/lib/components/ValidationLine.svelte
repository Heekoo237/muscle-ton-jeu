<script lang="ts">
	// Ligne de validation (maquette ui-screens ÉCRAN 2). Trois états, doublés d'une
	// forme (filet gauche 3 px + icône). TOUTE la ligne est tappable : elle ouvre
	// la feuille de correction pour changer le pari. Aucune saisie au clavier.
	import type { ValidationLineVM } from '../../routes/(app)/analyser/validation/+page.server';
	import { formatCote } from '$lib/format';

	let { selection, onOpen }: { selection: ValidationLineVM; onOpen: (s: ValidationLineVM) => void } =
		$props();

	const index = $derived(String(selection.ordre).padStart(2, '0'));
	const etat = $derived(selection.etatResolution);
	const raison = $derived(selection.raison);
	// États CALMES (informatifs, rien à corriger) : marché non couvert, ou match
	// dans un championnat non couvert. Pas d'alerte rouge. La ligne reste, non
	// analysée, non facturée.
	const nonCouvert = $derived(etat === 'inconnu' && raison === 'non_couvert');
	const horsCouv = $derived(etat === 'inconnu' && raison === 'hors_couverture');
	const nonResolu = $derived(etat === 'inconnu' && raison === 'non_resolu');
	const horsFenetre = $derived(etat === 'inconnu' && raison === 'hors_fenetre');
	const commence = $derived(etat === 'inconnu' && raison === 'commence');
	// Match + marché RÉSOLUS mais sans prédiction en base : pas une erreur de lecture,
	// pas une alerte — on n'a simplement pas de donnée pour cette ligne. État CALME,
	// jamais coché vert (sinon on promet une analyse qui n'aura pas lieu).
	const sansPrediction = $derived(etat === 'certain' && selection.analysable === false);
	const certainOk = $derived(etat === 'certain' && !sansPrediction);
	const calme = $derived(
		nonCouvert || horsCouv || nonResolu || horsFenetre || commence || sansPrediction
	);
	const dataState = $derived(calme ? 'noncouvert' : etat);
	const icone = $derived(certainOk ? '✓' : calme ? '–' : etat === 'ambigu' ? '▲' : '✕');
</script>

<button class="line" data-state={dataState} type="button" onclick={() => onOpen(selection)}>
	<span class="idx">{index}</span>
	<span class="ic">{icone}</span>
	<div class="mid">
		<div class="match">{selection.matchLabel}</div>
		{#if certainOk}
			<div class="market">{selection.libelleFr}</div>
		{:else if sansPrediction}
			<div class="hint">Pas encore de données pour ce match — gardé, non analysé</div>
		{:else if commence}
			<div class="hint">Ce match a déjà commencé — on ne l'analyse pas</div>
		{:else if horsCouv}
			<div class="hint">Championnat non couvert — gardé, non analysé, non facturé</div>
		{:else if nonResolu}
			<div class="hint">On n'a pas retrouvé ce match — gardé, non analysé</div>
		{:else if horsFenetre}
			<div class="hint">Match pas encore dans la période analysée — gardé, non analysé</div>
		{:else if nonCouvert}
			<div class="hint">Ce marché, on ne le couvre pas — gardé, non analysé</div>
		{:else if etat === 'ambigu'}
			<div class="hint oc">À corriger — plusieurs lectures possibles</div>
		{:else if selection.fixtureId != null}
			<div class="hint">On n'a pas lu ton pari — tape pour corriger</div>
		{:else}
			<div class="hint">On n'a pas lu ce match — tape pour retirer</div>
		{/if}
	</div>
	{#if certainOk && selection.coteSaisie != null}
		<span class="cote">{formatCote(selection.coteSaisie)}</span>
	{:else}
		<span class="chev" aria-hidden="true">›</span>
	{/if}
</button>

<style>
	.line {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		min-height: 64px;
		padding: var(--s-3) var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		box-sizing: border-box;
		font-family: var(--font-body);
		text-align: left;
		cursor: pointer;
		/* Apparition en fondu (opacity). La bascule d'état ne déplace jamais la
		   ligne. La pression rend un léger enfoncement (transform, 100 ms). On s'en
		   tient à opacity + transform (DESIGN §7 : jamais de transition de couleur). */
		animation: vl-in 200ms ease-out both;
		transition: transform 100ms ease-out;
	}
	.line:active {
		transform: scale(0.995);
	}
	@keyframes vl-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.line {
			animation: none;
		}
	}
	.line[data-state='certain'] {
		border-left: 3px solid var(--c-vert);
	}
	.line[data-state='ambigu'] {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.line[data-state='inconnu'] {
		background: var(--c-rouge-wash);
		border-left: 3px solid var(--c-rouge);
	}
	/* Non couvert : neutre (ni vert, ni ocre, ni rouge). Ce n'est pas une erreur. */
	.line[data-state='noncouvert'] {
		border-left: 3px solid var(--c-line-strong);
	}
	.line[data-state='noncouvert'] .ic {
		color: var(--c-ink-3);
	}
	.idx {
		flex: 0 0 24px;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink-3);
	}
	.ic {
		flex: 0 0 16px;
		font-size: 16px;
		font-weight: 600;
		line-height: 1;
	}
	.line[data-state='certain'] .ic {
		color: var(--c-vert);
	}
	.line[data-state='ambigu'] .ic {
		color: var(--c-ocre);
		font-weight: 400;
	}
	.line[data-state='inconnu'] .ic {
		color: var(--c-rouge);
	}
	.mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.match {
		font-size: 16px;
		color: var(--c-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.market {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.hint {
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.hint.oc {
		color: var(--c-ocre);
	}
	.cote {
		flex: 0 0 44px;
		text-align: right;
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 16px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.chev {
		flex: 0 0 auto;
		color: var(--c-ink-3);
		font-size: 22px;
		line-height: 1;
	}
</style>
