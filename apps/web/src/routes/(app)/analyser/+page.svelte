<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import FlowHeader from '$lib/components/FlowHeader.svelte';
	import AmbianceBanner from '$lib/components/AmbianceBanner.svelte';

	// Écran de lecture : pendant l'analyse, on montre un état réel qui avance
	// (on lit → on reconnaît → on calcule), sur fond de bandeau d'ambiance. Pas de
	// fausse barre de progression, pas de pourcentage inventé. Le mouvement est
	// autorisé AVANT le résultat, jamais pendant.
	const STEPS = ['On lit ta capture…', 'On reconnaît les matchs…', 'On calcule tes chances…'];

	let reading = $state(false);
	let step = $state(0);

	// Durée minimale d'affichage : chaque étape doit avoir le temps d'apparaître,
	// même si le serveur répond instantanément (la vraie vision prendra le relais).
	const STEP_MS = 850;
	const MIN_VISIBLE = STEPS.length * STEP_MS; // 2 550 ms
</script>

<svelte:head>
	<title>Analyser un ticket — Muscle Ton Jeu</title>
</svelte:head>

<FlowHeader title="Analyser un ticket" back="/" />

<main class="container">
	<p class="t-body-lg intro measure">Envoie 1 à 3 captures de ton ticket. Rien d'autre.</p>

	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance={() => {
			reading = true;
			step = 0;
			const started = Date.now();
			const t1 = setTimeout(() => (step = 1), STEP_MS);
			const t2 = setTimeout(() => (step = 2), STEP_MS * 2);
			return async ({ result }) => {
				const wait = Math.max(0, MIN_VISIBLE - (Date.now() - started));
				await new Promise((r) => setTimeout(r, wait));
				clearTimeout(t1);
				clearTimeout(t2);
				await applyAction(result);
			};
		}}
	>
		<div class="slots">
			{#each [0, 1, 2] as i (i)}
				<label class="upload-slot t-body">
					<input type="file" accept="image/*" name={`capture_${i}`} hidden />
					<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
						<path
							d="M12 5v14M5 12h14"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
					<span>Capture {i + 1}</span>
				</label>
			{/each}
		</div>

		<p class="t-small note">
			Les tickets manuscrits sur papier ne sont pas acceptés. Envoie une capture d'écran de ton
			application ou site de paris.
		</p>

		<button class="btn-primary" type="submit" disabled={reading}>
			{reading ? 'Lecture en cours…' : 'Analyser mon ticket'}
		</button>
	</form>
</main>

{#if reading}
	<!-- Écran de lecture, plein cadre. Fond crème (jamais blanc ni sombre, même en
	     attente — DESIGN §2.2), bandeau d'ambiance en tête, état réel au centre. -->
	<div class="reading" role="status" aria-live="polite">
		<AmbianceBanner />
		<div class="reading-body">
			<ol class="steps">
				{#each STEPS as s, i (s)}
					<li class="step" class:on={i <= step} class:done={i < step}>
						<span class="dot" aria-hidden="true">{i < step ? '✓' : '•'}</span>
						<span class="label">{s}</span>
					</li>
				{/each}
			</ol>
			<p class="t-small hint">On garde ton ticket. Ça arrive.</p>
		</div>
		<AmbianceBanner />
	</div>
{/if}

<style>
	main {
		padding-top: var(--s-6);
	}
	.intro {
		color: var(--c-ink-2);
		margin: 0 0 var(--s-6);
	}
	.slots {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}
	.upload-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		height: 120px;
		border-radius: var(--r-lg);
		background: var(--c-canvas-sunk);
		color: var(--c-ink-2);
		border: 1px dashed var(--c-line-strong);
		cursor: pointer;
		text-align: center;
	}
	.note {
		color: var(--c-ink-3);
		margin: 0 0 var(--s-6);
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
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.btn-primary:disabled {
		background: var(--c-canvas-sunk);
		color: var(--c-ink-mute);
		border: 1px solid var(--c-line);
	}

	/* ---- Écran de lecture ---- */
	.reading {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: var(--c-canvas);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}
	.reading-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		gap: var(--s-6);
		max-width: var(--container-max);
		width: 100%;
		margin-inline: auto;
		padding: var(--s-8) var(--s-4);
		box-sizing: border-box;
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
		/* Chaque ligne apparaît en fondu quand l'étape commence. */
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
	/* Les étapes franchies reculent, sans disparaître. */
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
		.step {
			transition: none;
		}
	}
</style>
