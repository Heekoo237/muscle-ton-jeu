<script lang="ts">
	// Comparaison en tickets papier (même langage que la landing) : « Ton ticket »
	// et « Ton ticket renforcé » côte à côte, bords perforés, cotes en mono. Piloté
	// par les données pour être réutilisable (détail d'historique, aperçus).
	// Desktop : côte à côte. Mobile : empilé, pleine largeur (lisible à 360px).
	const ANTON = "'Anton', Impact, sans-serif";
	const MONO = "'JetBrains Mono', ui-monospace, monospace";

	type Line = {
		matchLabel: string;
		libelleFr: string;
		fragile: boolean;
		retiree: boolean;
		// Retirée sans badge rouge (double chance, plus de 1,5) → mention neutre.
		mentionNeutre?: boolean;
		// Marché non couvert : ligne NEUTRE (ni ocre, ni barrée, ni fragile). Elle
		// reste dans les deux tickets — on n'a simplement pas pu la lire.
		analysable?: boolean;
	};

	let {
		lines,
		probaTotalePct,
		probaRenforceePct,
		dateLabel = '',
		single = false
	}: {
		lines: Line[];
		probaTotalePct: number;
		probaRenforceePct: number;
		dateLabel?: string;
		// Un seul ticket : quand rien n'est retiré, le ticket renforcé est identique
		// à l'original — afficher deux fois la même chose serait un doublon inutile.
		// On masque alors la colonne de droite et la flèche, on garde « Ton ticket ».
		single?: boolean;
	} = $props();

	function pct(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}
</script>

<div class="compare">
	<!-- A · RÉSUMÉ (mobile uniquement) — le chiffre central du produit, AU-DESSUS des
	     deux tickets, pour qu'il soit vu sans scroller. Sur desktop les tickets sont
	     côte à côte : l'annonce serait redondante, on la masque. Quand rien n'est
	     retiré (single), un seul chiffre — sinon l'utilisateur ne comprend pas
	     l'absence de second ticket. -->
	<div class="resume">
		<span class="resume-label">Tes chances</span>
		<span class="resume-vals" style="font-family:{MONO}">
			<span class="resume-from">{pct(probaTotalePct)}</span>
			{#if !single}
				<span class="resume-fleche" aria-hidden="true">→</span>
				<span class="resume-to">{pct(probaRenforceePct)}</span>
			{/if}
		</span>
	</div>

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
							{#if l.analysable === false}<div class="pnote muted">non analysé</div>{/if}
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

	{#if !single}
	<!-- B · SÉPARATEUR (mobile) — pleine largeur, juste APRÈS « TES CHANCES » du
	     premier ticket, pour qu'on sache qu'il y a un second ticket en dessous. -->
	<div class="bridge" aria-hidden="true">
		<span class="bridge-fleche">↓</span>
		<span class="bridge-label">ton ticket renforcé</span>
	</div>
	<!-- Flèche desktop (côte à côte) : pastille centrale entre les deux tickets. -->
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
						<div class="pline" class:removed={l.retiree}>
							<div class="pmatch" class:strike={l.retiree}>
								{l.matchLabel}{#if l.retiree}<span class="ptag">retiré</span>{/if}
							</div>
							<div class="pmarket" class:strike={l.retiree}>{l.libelleFr}</div>
							{#if l.analysable === false}
								<div class="pnote muted">non analysé</div>
							{:else if l.mentionNeutre}
								<div class="pnote">la moins solide de ton ticket</div>
							{/if}
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
	{/if}
</div>

<style>
	.compare {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--s-5);
	}
	/* A · Résumé mobile : le chiffre central, au-dessus des tickets. Sobre, sans
	   animation. Masqué en desktop (tickets côte à côte → annonce redondante). */
	.resume {
		display: flex;
		align-items: baseline;
		justify-content: center;
		flex-wrap: wrap;
		gap: 4px 10px;
		padding: var(--s-3) var(--s-4);
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
	}
	.resume-label {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.4px;
		text-transform: uppercase;
		color: var(--c-ink-3);
	}
	.resume-vals {
		display: inline-flex;
		align-items: baseline;
		gap: 10px;
		font-variant-numeric: tabular-nums;
	}
	.resume-from {
		font-size: 22px;
		color: var(--c-ink);
	}
	.resume-fleche {
		font-size: 16px;
		color: var(--c-ink-3);
	}
	.resume-to {
		font-size: 22px;
		font-weight: 600;
		color: var(--c-accent);
	}
	/* B · Séparateur mobile : pleine largeur, juste après le premier ticket. */
	.bridge {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		padding: var(--s-2) 0;
		border-top: 1px dashed var(--c-line-strong);
		color: var(--c-ink-2);
	}
	.bridge-fleche {
		font-size: 18px;
		line-height: 1;
		color: var(--c-ink-2);
	}
	.bridge-label {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.6px;
		text-transform: uppercase;
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
	/* Mobile : le séparateur `.bridge` nomme déjà « ton ticket renforcé » juste au-
	   dessus → on masque le libellé redondant de la colonne de droite. */
	.col.right .collabel {
		display: none;
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
	/* Ligne retirée : on doit la voir en UNE seconde, sans lire (y compris en plein
	   soleil sur un écran bas de gamme). Rature nette et sombre, texte bien atténué,
	   étiquette « retiré » en fin de ligne. */
	.pmatch.strike,
	.pmarket.strike {
		color: var(--c-ink-3);
		text-decoration: line-through;
		text-decoration-color: var(--c-ink);
		text-decoration-thickness: 2px;
	}
	.pline.removed {
		opacity: 0.92;
	}
	.ptag {
		display: inline-block;
		margin-left: 8px;
		padding: 1px 8px;
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-paper, #fdfaf3);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		text-decoration: none;
		vertical-align: 1px;
		white-space: nowrap;
	}
	.pnote {
		font-size: 12px;
		line-height: 1.3;
		color: var(--c-ink-3);
		padding-left: 14px;
		font-style: italic;
	}
	/* Mention non analysée : grise, NEUTRE (ni ocre, ni italique d'alerte). */
	.pnote.muted {
		font-style: normal;
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
	/* La pastille-flèche est le connecteur DESKTOP (entre tickets côte à côte). Sur
	   mobile, c'est le séparateur pleine largeur `.bridge` qui joue ce rôle → masquée. */
	.arrow {
		align-self: center;
		width: 44px;
		height: 44px;
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line-strong);
		display: none;
		align-items: center;
		justify-content: center;
		font-size: 18px;
		color: var(--c-ink-2);
	}

	/* Desktop : côte à côte, arrow au centre, léger décalage « papier ». Le résumé
	   et le séparateur mobile disparaissent (les deux tickets sont déjà visibles). */
	@media (min-width: 760px) {
		.compare {
			flex-direction: row;
			align-items: center;
			justify-content: center;
			gap: 0;
		}
		.resume,
		.bridge {
			display: none;
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
			display: flex;
			flex: 0 0 auto;
			margin: 0 -18px;
			z-index: 2;
		}
		.col.right .collabel {
			display: block;
		}
	}
</style>
