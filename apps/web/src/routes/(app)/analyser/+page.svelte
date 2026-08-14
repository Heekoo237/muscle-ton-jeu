<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { enhance, applyAction } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { compressImage } from '$lib/compressImage';
	import FlowHeader from '$lib/components/FlowHeader.svelte';
	import LoadingCurtain from '$lib/components/LoadingCurtain.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Messages d'échec de lecture — clairs, jamais techniques, jamais facturés.
	const ERREURS: Record<string, string> = {
		aucune: 'Ajoute au moins une capture de ton ticket.',
		pas_une_image: "Ce fichier n'est pas une image. Envoie une capture d'écran.",
		illisible: "On n'arrive pas à lire. Réessaie ou saisis à la main.",
		manuscrit: 'On lit les captures d’écran, pas les tickets papier.',
		pas_un_ticket: "Cette image n'est pas un ticket. Envoie la capture de ton ticket."
	};
	let erreurMsg = $derived(form?.erreur ? (ERREURS[form.erreur] ?? ERREURS.illisible) : null);

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

	// Écran de lecture : état RÉEL, jamais un minuteur factice. Cette étape du
	// parcours fait deux choses côté serveur — lire la capture (vision, l'essentiel
	// du temps) puis reconnaître les matchs (résolution). « On calcule tes chances »
	// n'a PAS lieu ici : le calcul se fait à l'affichage du résultat, après la
	// validation — on ne l'annonce donc pas ici. Le mouvement de fond (« CHARGEMENT »)
	// dit que ça travaille, sans fausse progression.
	const STEPS = ['On lit ta capture…', 'On reconnaît les matchs…'];

	let reading = $state(false);
	let step = $state(0);

	// Aperçu des captures : dès qu'une image est choisie, on l'affiche. L'utilisateur
	// voit que sa capture est bien prise, sans attendre de valider. Aperçu local
	// (objet URL) : aucun octet ne part sur le réseau à ce stade.
	const SLOTS = [0, 1, 2];
	let previews = $state<(string | null)[]>([null, null, null]);
	// Version compressée par slot, prête à envoyer (JPEG). Null tant qu'absente.
	let compressed = $state<(Blob | null)[]>([null, null, null]);
	let busy = $state(0); // nombre de compressions en cours (bloque l'envoi)
	let localErreur = $state<string | null>(null);
	let inputs: (HTMLInputElement | null)[] = [null, null, null];

	async function onPick(i: number, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			localErreur = ERREURS.pas_une_image;
			clear(i);
			return;
		}
		localErreur = null;
		if (previews[i]) URL.revokeObjectURL(previews[i]!);
		previews[i] = URL.createObjectURL(file); // aperçu immédiat depuis l'original
		busy += 1;
		try {
			compressed[i] = await compressImage(file); // réduit avant envoi (forfait data)
		} finally {
			busy -= 1;
		}
	}

	function clear(i: number) {
		if (previews[i]) URL.revokeObjectURL(previews[i]!);
		previews[i] = null;
		compressed[i] = null;
		if (inputs[i]) inputs[i]!.value = ''; // ne pas soumettre une capture retirée
	}

	onDestroy(() => previews.forEach((u) => u && URL.revokeObjectURL(u)));

	// Le rideau reste au moins ce temps affiché pour ne pas CLIGNOTER si le serveur
	// répond très vite (vision factice en local). Ce n'est pas une fausse
	// progression : les ÉTAPES, elles, n'avancent que sur de vrais événements.
	const MIN_VISIBLE = 600;
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

	{#if erreurMsg || localErreur}
		<p class="erreur t-body" role="alert">{localErreur ?? erreurMsg}</p>
	{/if}

	<form
		method="POST"
		enctype="multipart/form-data"
		use:enhance={({ formData }) => {
			// Envoyer les versions COMPRESSÉES prêtes ; à défaut, l'original reste
			// dans formData (jamais de refus, seulement plus léger quand on peut).
			for (const i of SLOTS) {
				if (compressed[i]) formData.set(`capture_${i}`, compressed[i]!, `capture_${i}.jpg`);
			}
			reading = true;
			step = 0; // « On lit ta capture » — vraie durée de l'appel vision
			const started = Date.now();
			return async ({ result }) => {
				// Réponse reçue : la lecture est faite, les matchs sont reconnus.
				step = 1;
				const wait = Math.max(0, MIN_VISIBLE - (Date.now() - started));
				if (wait) await new Promise((r) => setTimeout(r, wait));
				// Échec (lecture impossible) : on rend la main pour réessayer.
				if (result.type !== 'redirect') reading = false;
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

		<button class="btn-primary" type="submit" disabled={reading || busy > 0}>
			{reading
				? 'Lecture en cours…'
				: busy > 0
					? 'Préparation…'
					: data.ticketOffert
						? 'Analyser mon ticket gratuitement'
						: 'Analyser mon ticket'}
		</button>
	</form>
</main>

{#if reading}
	<!-- Rideau de lecture : étapes RÉELLES + fond « CHARGEMENT » animé (§5). -->
	<LoadingCurtain steps={STEPS} current={step} />
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
	.erreur {
		background: var(--c-danger-wash, var(--c-canvas-sunk));
		border: 1px solid var(--c-danger-line, var(--c-line-strong));
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		color: var(--c-ink);
		margin: 0 0 var(--s-4);
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
</style>
