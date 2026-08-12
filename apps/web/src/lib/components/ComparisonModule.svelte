<script lang="ts">
	// Module de comparaison (DESIGN.md §8 + addendum §13 bis « le module papier »).
	// Deux tickets de caisse côte à côte, JAMAIS empilés, même à 360 px. Mono
	// partout sauf l'en-tête. Totaux calés sur la même ligne de base par des
	// hauteurs de ligne réservées (pire cas). Seule ombre du système : la découpe.
	import type { LineVM } from '$lib/types';
	import { formatCote } from '$lib/format';

	let {
		lignes,
		probaTotalePct,
		probaRenforceePct
	}: { lignes: LineVM[]; probaTotalePct: number; probaRenforceePct: number } = $props();

	// Le module ne compare que les sélections analysables.
	const items = $derived(lignes.filter((l) => l.analysable));

	function pct(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
</script>

<div class="wrap">
	<!-- Colonne gauche : ton ticket (total en encre) -->
	<section class="paper left" aria-label="Ton ticket">
		<h2 class="head">TON TICKET</h2>
		<ul class="lines">
			{#each items as l (l.ordre)}
				<li class="row">
					<span class="idx">{l.index}</span>
					<span class="name">
						{l.matchLabel}
						<span class="mkt">{l.libelleFr}</span>
					</span>
					<span class="right">
						{#if l.cote != null}<span class="cote">{formatCote(l.cote)}</span>{/if}
						{#if l.fragile}<span class="warn" aria-label="fragile">▲</span>{/if}
					</span>
				</li>
			{/each}
		</ul>
		<div class="total">
			<span class="tlabel">TES CHANCES</span>
			<span class="tval ink">{pct(probaTotalePct)}</span>
		</div>
	</section>

	<!-- Colonne droite : ton ticket renforcé (total en accent) -->
	<section class="paper right" aria-label="Ton ticket renforcé">
		<h2 class="head">TON TICKET RENFORCÉ</h2>
		<ul class="lines">
			{#each items as l (l.ordre)}
				<li class="row" class:removed={l.retiree}>
					<span class="idx">{l.index}</span>
					<span class="name">
						{l.matchLabel}
						<span class="mkt">{l.libelleFr}</span>
					</span>
					<span class="right">
						{#if l.cote != null}<span class="cote">{formatCote(l.cote)}</span>{/if}
						{#if l.retiree}<span class="tag">retiré</span>{/if}
					</span>
				</li>
			{/each}
		</ul>
		<div class="total">
			<span class="tlabel">TES CHANCES</span>
			<span class="tval accent">{pct(probaRenforceePct)}</span>
		</div>
	</section>
</div>

<style>
	.wrap {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-3);
		/* Seule exception à « aucune ombre » : elle suit la découpe du papier. */
		filter: drop-shadow(0 3px 5px rgba(36, 32, 27, 0.13));
	}
	.paper {
		position: relative;
		background: var(--c-paper);
		padding: var(--s-4) 11px var(--s-3);
		font-family: var(--font-mono);
		/* Bords droits : un ticket n'a pas de coins arrondis. */
	}
	/* Inclinaison symétrique (±0,6° mobile) — les deux totaux retombent ensemble. */
	.left {
		transform: rotate(-0.6deg);
	}
	.right {
		transform: rotate(0.6deg);
	}
	/* Dents de scie haut et bas (aucune image). */
	.paper::before,
	.paper::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 10px;
		background-image: radial-gradient(circle at 50% 0, transparent 0 5px, var(--c-paper) 5.5px);
		background-size: 14px 10px;
		background-repeat: repeat-x;
	}
	.paper::before {
		top: -9px;
	}
	.paper::after {
		bottom: -9px;
		transform: scaleY(-1);
	}
	.head {
		font-family: var(--font-title);
		font-size: 15px;
		letter-spacing: 0.4px;
		text-align: center;
		color: var(--c-ink);
		margin: 0 0 var(--s-3);
		padding-bottom: var(--s-2);
		border-bottom: 1px dashed var(--c-line-strong);
		min-height: 44px;
	}
	.lines {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 18px 1fr 46px;
		gap: 6px;
		align-items: start;
		padding: var(--s-2) 0;
		border-bottom: 1px dashed var(--c-line-strong);
		/* Hauteur réservée sur la ligne entière (pire cas de retour ligne). */
		min-height: 80px;
		font-size: 13.5px;
		color: var(--c-ink);
	}
	.idx {
		color: var(--c-ink-3);
	}
	.name {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		word-break: break-word;
	}
	.mkt {
		color: var(--c-ink-2);
		font-size: 12.5px;
	}
	.right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
	}
	.cote {
		color: var(--c-ink-3);
	}
	.warn {
		color: var(--c-ocre);
		font-size: 14px;
	}
	.tag {
		color: var(--c-ink-3);
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	/* Ligne retirée : nom, marché ET cote barrés, garde sa place. */
	.row.removed {
		color: var(--c-ink-3);
	}
	.row.removed .name,
	.row.removed .cote {
		text-decoration: line-through 1px;
	}
	.total {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		padding-top: var(--s-3);
		margin-top: var(--s-1);
	}
	.tlabel {
		font-size: 11px;
		letter-spacing: 0.4px;
		color: var(--c-ink-2);
	}
	.tval {
		font-size: 30px;
		line-height: 1;
		font-feature-settings: 'tnum' 1;
	}
	.tval.ink {
		color: var(--c-ink);
	}
	.tval.accent {
		color: var(--c-accent);
	}
	@media (min-width: 768px) {
		.wrap {
			gap: var(--s-6);
		}
		.left {
			transform: rotate(-0.8deg);
		}
		.right {
			transform: rotate(0.8deg);
		}
		.head {
			font-size: 18px;
		}
		.tval {
			font-size: 34px;
		}
	}
</style>
