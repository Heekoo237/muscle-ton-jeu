<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { deserialize } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { ActionResult } from '@sveltejs/kit';
	import type { ActionData, PageData } from './$types';
	import { compressImage, peutDecoder } from '$lib/compressImage';
	import { libelleOffertes } from '$lib/offer';
	import FlowHeader from '$lib/components/FlowHeader.svelte';
	import LoadingCurtain from '$lib/components/LoadingCurtain.svelte';
	import LegalNote from '$lib/components/LegalNote.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Messages d'échec de lecture — clairs, jamais techniques, jamais facturés.
	const ERREURS: Record<string, string> = {
		aucune: 'Ajoute au moins une capture de ton ticket.',
		pas_une_image: "Ce fichier n'est pas une image. Envoie une capture d'écran.",
		illisible: "On n'arrive pas à lire. Réessaie ou saisis à la main.",
		incomplete: "Ta capture n'est pas arrivée entière — ça arrive quand le réseau coupe. Renvoie-la, on garde ta photo.",
		format_photo: "On n'arrive pas à lire ce type de photo. Fais plutôt une capture d'écran de ton ticket.",
		manuscrit: 'On lit les captures d’écran, pas les tickets papier.',
		pas_un_ticket: "Cette image n'est pas un ticket. Envoie la capture de ton ticket.",
		indisponible: 'La lecture est momentanément indisponible. Réessaie, ou écris au support.',
		trop_de_tentatives: 'Trop de tentatives. Réessaie dans quelques minutes.'
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
		busy += 1;
		try {
			// Le navigateur sait-il décoder cette photo ? (HEIC iPhone sur Chrome Android
			// = non). Si non, inutile de l'envoyer : la vision ne la lira pas non plus.
			if (!(await peutDecoder(file))) {
				localErreur = ERREURS.format_photo;
				clear(i);
				return;
			}
			localErreur = null;
			if (previews[i]) URL.revokeObjectURL(previews[i]!);
			previews[i] = URL.createObjectURL(file); // aperçu immédiat depuis l'original
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

	// ── Envoi ROBUSTE : réessai automatique sur réseau instable ──────────────────
	// Notre marché est l'Afrique : connexion qui coupe, Android d'entrée de gamme.
	// Un envoi qui casse ne doit PAS renvoyer l'utilisateur au geste initial. On
	// réessaie tout seul (2 essais), l'essai 2 avec une compression PLUS DOUCE au cas
	// où c'est notre compression qui a dégradé la lisibilité. On le DIT pendant l'attente.
	const MAX_ESSAIS = 2;
	let essai = $state(0); // 0 = pas en cours ; 1/2 = numéro de l'essai affiché

	// Précision : pendant l'essai 2, on le DIT et on donne un ordre de grandeur du
	// temps — un utilisateur qui attend sans signal croit que c'est planté.
	const curtainHint = $derived(
		essai >= 2
			? 'On réessaie une dernière fois — ça peut prendre jusqu’à quinze secondes.'
			: 'On garde ton ticket. Ça arrive.'
	);

	/** Recompresse les originaux plus DOUCEMENT (plus grand, meilleure qualité). */
	async function recompresserDoux() {
		for (const i of SLOTS) {
			const f = inputs[i]?.files?.[0];
			if (f) compressed[i] = await compressImage(f, 1800, 0.85);
		}
	}

	function construireFormData(): FormData {
		const fd = new FormData();
		for (const i of SLOTS) {
			if (compressed[i]) fd.set(`capture_${i}`, compressed[i]!, `capture_${i}.jpg`);
			else if (inputs[i]?.files?.[0]) fd.set(`capture_${i}`, inputs[i]!.files![0]);
		}
		return fd;
	}

	/** Télémétrie best-effort : a-t-on eu besoin de l'essai 2, a-t-il échoué ? */
	function beaconRetry(echec: boolean) {
		fetch('/api/analyse-retry', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ echec }),
			keepalive: true
		}).catch(() => {});
	}

	async function soumettre(e: SubmitEvent) {
		e.preventDefault();
		if (reading || busy > 0) return;
		const form = e.currentTarget as HTMLFormElement;
		const action = form.action;
		reading = true;
		step = 0;
		essai = 0;
		localErreur = null;
		const started = Date.now();
		let derniereErreur: string | null = null;

		for (let n = 1; n <= MAX_ESSAIS; n++) {
			essai = n;
			if (n === 2) await recompresserDoux();
			const fd = construireFormData();
			let result: ActionResult | null = null;
			try {
				const res = await fetch(action, {
					method: 'POST',
					body: fd,
					headers: { 'x-sveltekit-action': 'true' }
				});
				result = deserialize(await res.text());
			} catch {
				result = null; // coupure réseau : l'envoi n'a pas abouti
			}

			if (result?.type === 'redirect') {
				if (n === 2) beaconRetry(false); // l'essai 2 a sauvé l'analyse
				const attente = Math.max(0, MIN_VISIBLE - (Date.now() - started));
				if (attente) await new Promise((r) => setTimeout(r, attente));
				goto(result.location); // succès → validation / résultat
				return;
			}

			derniereErreur = result?.type === 'failure' ? String(result.data?.erreur ?? '') : 'reseau';
			// Seuls une coupure réseau ou une capture incomplète méritent un réessai :
			// un vrai « pas un ticket » ne s'arrangera pas en renvoyant la même image.
			const reessayable = derniereErreur === 'incomplete' || derniereErreur === 'reseau';
			if (reessayable && n < MAX_ESSAIS) {
				await new Promise((r) => setTimeout(r, 1000)); // léger répit avant l'essai 2
				continue;
			}
			break;
		}

		// Échec définitif.
		if (essai === 2) beaconRetry(true); // a réessayé, a quand même échoué
		reading = false;
		essai = 0;
		const reseauOuIncomplet = derniereErreur === 'reseau' || derniereErreur === 'incomplete';
		localErreur = reseauOuIncomplet
			? ERREURS.incomplete
			: (ERREURS[derniereErreur ?? 'illisible'] ?? ERREURS.illisible);
	}
</script>

<svelte:head>
	<title>Analyser un ticket — Muscle Ton Jeu</title>
</svelte:head>

<FlowHeader title="Analyser un ticket" back="/" />

<main class="container">
	{#if data.offertesRestantes > 0}
		<!-- Décompte : une information utile pour le testeur, pas une pression. -->
		<div class="offert-banner t-body">Il te reste {libelleOffertes(data.offertesRestantes)}.</div>
	{/if}

	<p class="t-body-lg intro measure">Envoie 1 à 3 captures de ton ticket. Rien d'autre.</p>
	<!-- Conformité n°4 : mention 18+ dans le hero de l'entrée du parcours. -->
	<LegalNote variant="hero" />

	{#if erreurMsg || localErreur}
		<p class="erreur t-body" role="alert">{localErreur ?? erreurMsg}</p>
	{/if}

	<form method="POST" enctype="multipart/form-data" onsubmit={soumettre}>
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
			Envoie une capture d'écran de ton
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
	<LoadingCurtain steps={STEPS} current={step} hint={curtainHint} />
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
