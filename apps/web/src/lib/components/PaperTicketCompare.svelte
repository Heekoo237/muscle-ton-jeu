<script lang="ts">
	// Comparaison en tickets papier (même langage que la landing) : « Ton ticket »
	// et « Ton ticket renforcé » côte à côte, bords perforés, cotes en mono. Piloté
	// par les données pour être réutilisable (détail d'historique, aperçus).
	// Desktop : côte à côte. Mobile : empilé, pleine largeur (lisible à 360px).
	const ANTON = "'Anton', Impact, sans-serif";
	const MONO = "'JetBrains Mono', ui-monospace, monospace";

	type Line = { matchLabel: string; libelleFr: string; fragile: boolean; retiree: boolean };

	let {
		lines,
		probaTotalePct,
		probaRenforceePct,
		dateLabel = ''
	}: {
		lines: Line[];
		probaTotalePct: number;
		probaRenforceePct: number;
		dateLabel?: string;
	} = $props();

	function pct(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
</script>

<div class="compare">
	<!-- Ton ticket -->
	<div class="col left">
		<div class="collabel">Ton ticket</div>
		<div class="ticket">
			<div class="edge top"></div>
			<div class="paper" style="font-family:{MONO}">
				<div class="phead">
					<div class="pname" style="font-family:{ANTON}">Muscle Ton Jeu</div>
					{#if dateLabel}<div class="pdate">{dateLabel}</div>{/if}
				</div>
				<div class="dash"></div>
				<div class="plines">
					{#each lines as l (l.matchLabel + l.libelleFr)}
						<div class="pline">
							<div class="pmatch">
								{l.matchLabel}{#if l.fragile}&nbsp;<span class="tri">▲</span>{/if}
							</div>
							<div class="pmarket">{l.libelleFr}</div>
						</div>
					{/each}
				</div>
				<div class="dash"></div>
				<div class="ptotal">
					<span class="plabel">TES CHANCES</span>
					<span class="ppct ink">{pct(probaTotalePct)}</span>
				</div>
			</div>
			<div class="edge bottom"></div>
		</div>
	</div>

	<div class="arrow" style="font-family:{MONO}" aria-hidden="true">→</div>

	<!-- Ton ticket renforcé -->
	<div class="col right">
		<div class="collabel">Ton ticket renforcé</div>
		<div class="ticket">
			<div class="edge top"></div>
			<div class="paper" style="font-family:{MONO}">
				<div class="phead">
					<div class="pname" style="font-family:{ANTON}">Muscle Ton Jeu</div>
					{#if dateLabel}<div class="pdate">{dateLabel}</div>{/if}
				</div>
				<div class="dash"></div>
				<div class="plines">
					{#each lines as l (l.matchLabel + l.libelleFr)}
						<div class="pline">
							<div class="pmatch" class:strike={l.retiree}>{l.matchLabel}</div>
							<div class="pmarket" class:strike={l.retiree}>{l.libelleFr}</div>
						</div>
					{/each}
				</div>
				<div class="dash"></div>
				<div class="ptotal">
					<span class="plabel">TES CHANCES</span>
					<span class="ppct accent">{pct(probaRenforceePct)}</span>
				</div>
			</div>
			<div class="edge bottom"></div>
		</div>
	</div>
</div>

<style>
	.compare {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--s-5);
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		min-width: 0;
	}
	.collabel {
		text-align: center;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		color: var(--c-ink-3);
	}
	.ticket {
		display: flex;
		flex-direction: column;
		filter: drop-shadow(0 3px 5px rgba(36, 32, 27, 0.13));
	}
	.edge {
		height: 10px;
		background-size: 14px 10px;
		background-repeat: repeat-x;
	}
	.edge.top {
		background-image: radial-gradient(circle at 50% 0, transparent 0 5px, var(--c-paper) 5.5px);
	}
	.edge.bottom {
		background-image: radial-gradient(circle at 50% 100%, transparent 0 5px, var(--c-paper) 5.5px);
	}
	.paper {
		background: var(--c-paper);
		padding: 20px 24px 24px;
		font-weight: 500;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.phead {
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: center;
	}
	.pname {
		font-size: 20px;
		line-height: 1.05;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		color: var(--c-ink);
	}
	.pdate {
		font-size: 14px;
		line-height: 1.35;
		color: var(--c-ink-3);
	}
	.dash {
		border-top: 1px dashed var(--c-line-strong);
	}
	.plines {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.pline {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.pmatch {
		font-size: 14px;
		line-height: 1.35;
		letter-spacing: 0.4px;
		color: var(--c-ink);
		overflow-wrap: anywhere;
	}
	.pmatch .tri {
		color: var(--c-ocre);
	}
	.pmarket {
		font-size: 14px;
		line-height: 1.35;
		color: var(--c-ink-3);
		padding-left: 14px;
		overflow-wrap: anywhere;
	}
	.pmatch.strike,
	.pmarket.strike {
		color: var(--c-ink-3);
		text-decoration: line-through;
	}
	.ptotal {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.plabel {
		font-size: 14px;
		letter-spacing: 0.6px;
		color: var(--c-ink);
	}
	.ppct {
		font-size: 34px;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.ppct.ink {
		color: var(--c-ink);
	}
	.ppct.accent {
		color: var(--c-accent);
	}
	.arrow {
		align-self: center;
		width: 44px;
		height: 44px;
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line-strong);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		color: var(--c-ink-2);
		transform: rotate(90deg);
	}

	/* Desktop : côte à côte, arrow au centre, léger décalage « papier ». */
	@media (min-width: 760px) {
		.compare {
			flex-direction: row;
			align-items: center;
			justify-content: center;
			gap: 0;
		}
		.col {
			flex: 0 1 420px;
		}
		.col.left {
			transform: rotate(-0.6deg);
		}
		.col.right {
			transform: rotate(0.6deg);
		}
		.arrow {
			flex: 0 0 auto;
			margin: 0 -18px;
			z-index: 2;
			transform: none;
		}
	}
</style>
