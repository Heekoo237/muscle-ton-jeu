<script lang="ts">
	// Bandeau d'ambiance — le mouvement autorisé AVANT l'analyse, jamais pendant le
	// résultat. Même langage visuel que le bandeau des championnats (aplat encre,
	// display en capitales), mais défile en sens INVERSE. Contenu : fragments de
	// commentaire générique. Aucun nom réel, aucune référence au pari, au gain,
	// à la cote ou au ticket. Purement décoratif → aria-hidden.
	//
	// Réutilisé sur le bas de la landing et en fond de l'écran de lecture.
	// Zéro image, zéro poids : de la lettre et de la couleur plate.
	const ANTON = "'Anton', Impact, sans-serif";

	// Commentaire de terrain, volontairement anonyme (ni équipe, ni joueur).
	const FRAGMENTS = [
		'DEUXIÈME POTEAU',
		'QUELLE FRAPPE',
		'IL RESTE DIX MINUTES',
		'ARRÊT RÉFLEXE',
		'CORNER À DROITE',
		'LE BALLON EST DEDANS',
		'QUEL RENVERSEMENT',
		'TROIS MINUTES DE PLUS',
		'CENTRE EN RETRAIT',
		'SORTIE DU GARDIEN',
		'CONTRE-ATTAQUE',
		'REPRISE DE VOLÉE',
		'PRESSING HAUT',
		'TÊTE AU PREMIER POTEAU'
	];
</script>

<div class="amb" aria-hidden="true">
	<div class="amb-track">
		{#each [0, 1] as dup (dup)}
			<div class="amb-row" style="font-family:{ANTON}">
				{#each FRAGMENTS as f (f)}
					<span>{f}</span><span class="sep">/</span>
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.amb {
		background: var(--c-ink);
		overflow: hidden;
		padding: 14px 0;
	}
	.amb-track {
		display: flex;
		width: max-content;
		/* sens inverse du bandeau des championnats (§ ambiance) */
		animation: amb-scroll 46s linear infinite reverse;
	}
	/* Les bandeaux se figent au survol ET au toucher (contrainte d'ambiance). */
	.amb-track:hover,
	.amb-track:active {
		animation-play-state: paused;
	}
	.amb-row {
		display: flex;
		gap: 20px;
		padding-right: 20px;
		font-size: 24px;
		line-height: 1.05;
		letter-spacing: -0.5px;
		color: var(--c-ink-inverse);
		text-transform: uppercase;
		white-space: nowrap;
	}
	.amb-row .sep {
		color: rgba(248, 241, 228, 0.45);
	}
	@keyframes amb-scroll {
		from {
			transform: translate3d(0, 0, 0);
		}
		to {
			transform: translate3d(-50%, 0, 0);
		}
	}
	/* Mouvement réduit honoré : le bandeau se fige (§13.2). */
	@media (prefers-reduced-motion: reduce) {
		.amb-track {
			animation: none;
		}
	}
</style>
