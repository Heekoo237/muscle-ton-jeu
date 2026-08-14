<script lang="ts">
	// Rideau d'attente plein cadre. Deux éléments, comme au brief §5 :
	//  a) l'état d'avancement RÉEL au premier plan (les étapes fournies ; l'appelant
	//     avance `current` sur de vrais événements, jamais sur un minuteur factice) ;
	//  b) en fond, le mot « CHARGEMENT » répété (police display), pulsation légère —
	//     c'est LUI qui dit « ça travaille », pas une fausse barre de progression.
	//
	// Contraintes respectées : CSS pur, aucune image, opacity + transform seulement,
	// prefers-reduced-motion honoré, zéro Ko ajouté (la police est déjà chargée).
	let {
		steps,
		current = 0,
		hint = 'On garde ton ticket. Ça arrive.'
	}: { steps: string[]; current?: number; hint?: string } = $props();

	const ROWS = [0, 1, 2, 3, 4, 5, 6];
</script>

<div class="curtain" role="status" aria-live="polite">
	<div class="bg" aria-hidden="true">
		{#each ROWS as r (r)}
			<div class="row" class:alt={r % 2 === 1}>CHARGEMENT CHARGEMENT CHARGEMENT CHARGEMENT</div>
		{/each}
	</div>

	<div class="fg">
		<ol class="steps">
			{#each steps as s, i (s)}
				<li class="step" class:on={i <= current} class:done={i < current}>
					<span class="dot" aria-hidden="true">{i < current ? '✓' : '•'}</span>
					<span class="label">{s}</span>
				</li>
			{/each}
		</ol>
		<p class="t-small hint">{hint}</p>
	</div>
</div>

<style>
	.curtain {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: var(--c-canvas); /* crème, jamais blanc ni sombre (DESIGN §2.2) */
		overflow: hidden;
		display: flex;
		align-items: center;
	}

	/* ---- Fond typographique « CHARGEMENT » ---- */
	.bg {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: clamp(4px, 2vw, 16px);
		pointer-events: none;
	}
	.row {
		font-family: var(--font-title);
		font-size: clamp(44px, 15vw, 120px);
		line-height: 1;
		text-transform: uppercase;
		letter-spacing: 4px;
		white-space: nowrap;
		color: var(--c-ink);
		opacity: 0.05;
		will-change: transform, opacity;
		animation:
			curtain-pulse 3.4s ease-in-out infinite,
			curtain-drift 26s linear infinite;
	}
	.row.alt {
		animation:
			curtain-pulse 3.4s ease-in-out infinite,
			curtain-drift-rev 30s linear infinite;
		opacity: 0.035;
	}
	@keyframes curtain-pulse {
		0%,
		100% {
			opacity: 0.04;
		}
		50% {
			opacity: 0.09;
		}
	}
	@keyframes curtain-drift {
		from {
			transform: translate3d(0, 0, 0);
		}
		to {
			transform: translate3d(-8%, 0, 0);
		}
	}
	@keyframes curtain-drift-rev {
		from {
			transform: translate3d(-8%, 0, 0);
		}
		to {
			transform: translate3d(0, 0, 0);
		}
	}

	/* ---- Étapes réelles au premier plan ---- */
	.fg {
		position: relative;
		z-index: 1;
		max-width: var(--container-max);
		width: 100%;
		margin-inline: auto;
		padding: var(--s-8) var(--s-4);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-4);
	}
	.step {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		font-family: var(--font-body);
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.4px;
		color: var(--c-ink);
		opacity: 0;
		transform: translateY(4px);
		transition:
			opacity 260ms ease-out,
			transform 260ms ease-out;
	}
	.step.on {
		opacity: 1;
		transform: none;
	}
	.step.done {
		opacity: 0.5;
		font-weight: 400;
	}
	.step .dot {
		flex: 0 0 auto;
		color: var(--c-ink-3);
		font-size: 16px;
		line-height: 1;
	}
	.hint {
		color: var(--c-ink-3);
		margin: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.row {
			animation: none;
			opacity: 0.05;
		}
		.step {
			transition: none;
		}
	}
</style>
