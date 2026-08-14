<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { ValidationLineVM } from './+page.server';
	import type { Market } from '$lib/types';
	import FlowHeader from '$lib/components/FlowHeader.svelte';
	import ValidationLine from '$lib/components/ValidationLine.svelte';
	import CorrectionSheet from '$lib/components/CorrectionSheet.svelte';
	import LoadingCurtain from '$lib/components/LoadingCurtain.svelte';

	let { data }: { data: PageData } = $props();

	// État LOCAL : on affiche et on modifie tout de suite, on enregistre en fond.
	// L'utilisateur n'attend jamais un aller-retour serveur (cet écran doit se
	// traiter au pouce en moins de 15 s). Copie initiale seedée une fois (untrack :
	// cet écran ne réinvalide pas ses données, l'état local fait foi ensuite).
	let lignes = $state<ValidationLineVM[]>(untrack(() => data.selections.map((s) => ({ ...s }))));
	let open = $state<ValidationLineVM | null>(null);
	let erreur = $state('');

	const analysables = $derived(lignes.filter((s) => s.etatResolution === 'certain').length);
	const total = $derived(lignes.length);

	// Enregistrements en vol : on les attend AVANT de finaliser, pour ne jamais
	// perdre une correction faite juste avant le tap « Analyser ».
	let enVol = $state<Promise<unknown>[]>([]);

	/** Enregistre en arrière-plan ; en cas d'échec, on revient en arrière et on prévient. */
	function sauver(action: string, champs: Record<string, string>, revert: () => void) {
		erreur = '';
		const p = (async () => {
			try {
				const body = new FormData();
				for (const [k, v] of Object.entries(champs)) body.set(k, v);
				const res = await fetch(`?/${action}`, { method: 'POST', body });
				if (!res.ok) throw new Error(String(res.status));
			} catch {
				revert();
				erreur = 'Pas de réseau — ta modification n’a pas été enregistrée. Réessaie.';
			}
		})();
		enVol.push(p);
		void p.finally(() => (enVol = enVol.filter((x) => x !== p)));
		return p;
	}

	// Finalisation : on affiche le rideau « On calcule tes chances » (le calcul —
	// probabilités + rédaction — a lieu maintenant, à l'affichage du résultat), et
	// si des enregistrements sont encore en vol on les attend d'abord (le serveur
	// lit le ticket en base) avant de soumettre réellement.
	let finalisation = false;
	let calcul = $state(false);
	async function onFinaliser(e: SubmitEvent) {
		if (finalisation) return; // deuxième passage : on laisse partir
		calcul = true; // le rideau reste visible pendant la navigation vers le résultat
		if (enVol.length > 0) {
			e.preventDefault();
			await Promise.allSettled(enVol);
			finalisation = true;
			(e.currentTarget as HTMLFormElement).requestSubmit();
		}
	}

	/** Choix instantané du marché : l'affichage change et la feuille se ferme aussitôt. */
	function corriger(marche: Market, label: string) {
		const cible = open;
		if (!cible) return;
		const avant = lignes.map((s) => ({ ...s }));
		lignes = lignes.map((s) =>
			s.ordre === cible.ordre
				? {
						...s,
						marche,
						etatResolution: 'certain',
						raison: undefined,
						candidates: undefined,
						libelleFr: label
					}
				: s
		);
		open = null;
		void sauver('corriger', { ordre: String(cible.ordre), marche }, () => (lignes = avant));
	}

	/** Retrait instantané d'une ligne non reconnue. */
	function retirer() {
		const cible = open;
		if (!cible) return;
		const avant = lignes.map((s) => ({ ...s }));
		lignes = lignes.filter((s) => s.ordre !== cible.ordre);
		open = null;
		void sauver('retirer', { ordre: String(cible.ordre) }, () => (lignes = avant));
	}
</script>

<svelte:head><title>Vérifie ton ticket — Muscle Ton Jeu</title></svelte:head>

<FlowHeader title="Ton ticket" back="/analyser" />

<main class="container">
	<div class="intro">
		<h1 class="t-h1">Vérifie ton ticket</h1>
		<p class="t-body sub">Tape sur une ligne pour changer le pari. Aucune saisie au clavier.</p>
	</div>

	{#if erreur}
		<p class="erreur" role="alert">{erreur}</p>
	{/if}

	<div class="lignes">
		{#each lignes as s (s.ordre)}
			<ValidationLine selection={s} onOpen={(sel) => (open = sel)} />
		{/each}
	</div>

	<form method="POST" action="?/finaliser" class="action" onsubmit={onFinaliser}>
		<button class="btn-dark" type="submit" disabled={analysables < 1}>
			Analyser {analysables} match{analysables > 1 ? 's' : ''} sur {total}
		</button>
		<p class="t-small compteur">
			Les lignes rouges ne sont pas comptées
		</p>
	</form>
</main>

{#if open}
	<CorrectionSheet
		selection={open}
		onChoose={corriger}
		onRemove={retirer}
		onClose={() => (open = null)}
	/>
{/if}

{#if calcul}
	<!-- Rideau pendant le calcul (probabilités + rédaction) : plus d'écran figé. -->
	<LoadingCurtain steps={['On calcule tes chances…']} current={0} />
{/if}

<style>
	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.intro h1 {
		margin: 0;
	}
	.sub {
		color: var(--c-ink-2);
		margin: 0;
	}
	.erreur {
		margin: 0;
		padding: var(--s-3) var(--s-4);
		background: var(--c-ocre-wash);
		border: 1px solid var(--c-ocre-line);
		border-radius: var(--r-md);
		color: var(--c-ocre);
		font-weight: 600;
	}
	.lignes {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.action {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.btn-dark {
		width: 100%;
		height: 52px;
		border: none;
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		font-feature-settings: 'tnum' 1;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.btn-dark:active {
		transform: scale(0.98);
	}
	.btn-dark:disabled {
		background: var(--c-canvas-sunk);
		color: var(--c-ink-mute);
		border: 1px solid var(--c-line);
	}
	.compteur {
		color: var(--c-ink-3);
		text-align: center;
		margin: 0;
	}
</style>
