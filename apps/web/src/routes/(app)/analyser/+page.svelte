<script lang="ts">
	import FlowHeader from '$lib/components/FlowHeader.svelte';

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Analyser un ticket — Muscle Ton Jeu</title>
</svelte:head>

<FlowHeader title="Analyser un ticket" back="/" />

<main class="container">
	<p class="t-body-lg intro measure">
		Envoie 1 à 3 captures de ton ticket. Rien d'autre.
	</p>

	<form method="POST" onsubmit={() => (submitting = true)}>
		<div class="slots">
			{#each [0, 1, 2] as i (i)}
				<label class="upload-slot t-body">
					<input type="file" accept="image/*" name={`capture_${i}`} hidden />
					<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
						<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
					<span>Capture {i + 1}</span>
				</label>
			{/each}
		</div>

		<p class="t-small note">
			Les tickets manuscrits sur papier ne sont pas acceptés. Envoie une capture
			d'écran de ton application ou site de paris.
		</p>

		<button class="btn-primary" type="submit" disabled={submitting}>
			{submitting ? 'Lecture en cours…' : 'Analyser mon ticket'}
		</button>
	</form>
</main>

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
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.btn-primary:disabled {
		background: var(--c-canvas-sunk);
		color: var(--c-ink-mute);
		border: 1px solid var(--c-line);
	}
</style>
