<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { enhance, applyAction } from '$app/forms';
	import type { PageData } from './$types';
	import FlowHeader from '$lib/components/FlowHeader.svelte';
	import AmbianceBanner from '$lib/components/AmbianceBanner.svelte';

	let { data }: { data: PageData } = $props();

	// Empreinte d'appareil : marqueur local persistant, posé en cookie pour que le
	// serveur puisse vérifier la gratuité du premier ticket (indicatif, non bloquant).
	onMount(() => {
		try {
			let fp = localStorage.getItem('mtj_fp');
			if (!fp) {
				fp = crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
				localStorage.setItem('mtj_fp', fp);
			}
			document.cookie = `mtj_fp=${fp}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
		} catch {
			// stockage indisponible (navigation privée stricte) : empreinte ignorée
		}
	});

	// Écran de lecture : pendant l'analyse, on montre un état réel qui avance
	// (on lit → on reconnaît → on calcule), sur fond de bandeau d'ambiance. Pas de
	// fausse barre de progression, pas de pourcentage inventé. Le mouvement est
	// autorisé AVANT le résultat, jamais pendant.
	const STEPS = ['On lit ta capture…', 'On reconnaît les matchs…', 'On calcule tes chances…'];

	let reading = $state(false);
	let step = $state(0);

	// Aperçu des captures : dès qu'une image est choisie, on l'affiche. L'utilisateur
	// voit que sa capture est bien prise, sans attendre de valider. Aperçu local
	// (objet URL) : aucun octet ne part sur le réseau à ce stade.
	const SLOTS = [0, 1, 2];
	let previews = $state<(string | null)[]>([null, null, null]);
	let inputs: (HTMLInputElement | null)[] = [null, null, null];

	function onPick(i: number, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (previews[i]) URL.revokeObjectURL(previews[i]!);
		previews[i] = URL.createObjectURL(file);
	}

	function clear(i: number) {
		if (previews[i]) URL.revokeObjectURL(previews[i]!);
		previews[i] = null;
		if (inputs[i]) inputs[i]!.value = ''; // ne pas soumettre une capture retirée
	}

	onDestroy(() => previews.forEach((u) => u && URL.revokeObjectURL(u)));

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
	{#if data.offert}
		<div class="offert-banner t-body">Ton premier ticket est offert.</div>
	{/if}

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
			{#each SLOTS as i (i)}
				<div class="slot" class:filled={previews[i]}>
					<label class="pick t-body">
						<input
							type="file"
							accept="image/*"
							name={`capture_${i}`}
							hidden
							bind:this={inputs[i]}
							onchange={(e) => onPick(i, e)}
						/>
						{#if previews[i]}
							<img src={previews[i]} alt={`Capture ${i + 1}`} />
						{:else}
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
						{/if}
					</label>
					{#if previews[i]}
						<span class="tag t-small">Capture {i + 1} · reçue</span>
						<button
							type="button"
							class="clear"
							aria-label={`Retirer la capture ${i + 1}`}
							onclick={() => clear(i)}>✕</button
						>
					{/if}
				</div>
			{/each}
		</div>

		<p class="t-small note">
			Les tickets manuscrits sur papier ne sont pas acceptés. Envoie une capture d'écran de ton
			application ou site de paris.
		</p>

		<button class="btn-primary" type="submit" disabled={reading}>
			{reading
				? 'Lecture en cours…'
				: data.ticketOffert
					? 'Analyser mon ticket gratuitement'
					: 'Analyser mon ticket'}
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
	.offert-banner {
		background: var(--c-accent-wash);
		border: 1px solid var(--c-accent-line);
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		color: var(--c-ink);
		margin-bottom: var(--s-4);
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
	.slot {
		position: relative;
		height: 120px;
	}
	.pick {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		width: 100%;
		height: 100%;
		border-radius: var(--r-lg);
		background: var(--c-canvas-sunk);
		color: var(--c-ink-2);
		border: 1px dashed var(--c-line-strong);
		cursor: pointer;
		text-align: center;
		overflow: hidden;
		box-sizing: border-box;
	}
	/* Capture reçue : la vignette remplit l'emplacement, bord plein (plus de tiret). */
	.slot.filled .pick {
		border-style: solid;
		border-color: var(--c-line-strong);
		background: var(--c-surface);
	}
	.pick img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: inherit;
	}
	.tag {
		position: absolute;
		left: var(--s-2);
		bottom: var(--s-2);
		display: inline-flex;
		align-items: center;
		height: 24px;
		padding: 0 var(--s-2);
		border-radius: var(--r-pill);
		background: var(--c-canvas);
		border: 1px solid var(--c-line);
		color: var(--c-ink);
		pointer-events: none;
	}
	.clear {
		position: absolute;
		top: var(--s-2);
		right: var(--s-2);
		width: 28px;
		height: 28px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--r-pill);
		background: var(--c-canvas);
		border: 1px solid var(--c-line-strong);
		color: var(--c-ink);
		font-size: 13px;
		line-height: 1;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.clear:active {
		transform: scale(0.92);
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
