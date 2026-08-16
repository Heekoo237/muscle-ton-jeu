<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import TestBanner from '$lib/components/TestBanner.svelte';

	let { data }: { data: PageData } = $props();

	type Phase = 'contact' | 'code' | 'confirmation' | 'succes' | 'echec';
	let phase = $state<Phase>('contact');
	let curtainMsg = $state('On contacte ton opérateur…');
	let code = $state('');
	let erreur = $state('');
	let echecMsg = $state('');
	let nouveauSolde = $state<number | null>(null);
	let copie = $state(false);
	// svelte-ignore state_referenced_locally
	let restant = $state(data.expireLeMs - Date.now());

	// Compte à rebours jusqu'à l'expiration (affiché pendant l'attente).
	onMount(() => {
		const t = setInterval(() => (restant = data.expireLeMs - Date.now()), 1000);
		return () => clearInterval(t);
	});
	const mmss = $derived.by(() => {
		const s = Math.max(0, Math.floor(restant / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	});

	// État initial : une transaction déjà résolue (ré-ouverture de l'URL) ne rejoue pas
	// le rideau — on montre directement son état.
	onMount(() => {
		if (data.statut === 'success') {
			phase = 'succes';
		} else if (data.statut === 'expired') {
			phase = 'echec';
			echecMsg = "Le paiement n'a pas abouti. Tu n'as pas été débité.";
		} else if (data.statut === 'failed') {
			phase = 'echec';
			echecMsg = 'Le paiement a échoué. Tu n’as pas été débité.';
		} else {
			// Délais RÉALISTES (3-8 s) : on ne teste rien avec un paiement instantané.
			curtainMsg = 'On contacte ton opérateur…';
			const a = setTimeout(() => (curtainMsg = 'Compose le code sur ton téléphone…'), 2600);
			const b = setTimeout(() => (phase = 'code'), 4800);
			return () => {
				clearTimeout(a);
				clearTimeout(b);
			};
		}
	});

	function appliquer(resultat: string | undefined, solde: number | null) {
		if (resultat === 'succes') {
			nouveauSolde = solde;
			phase = 'succes';
			setTimeout(() => goto(data.retour), 1700); // retour AU tableau de bord, solde à jour
		} else if (resultat === 'refuse') {
			erreur = 'Code incorrect. Réessaie.';
			phase = 'code';
		} else if (resultat === 'solde') {
			echecMsg = 'Solde insuffisant sur ton compte Mobile Money. Rien ne t’a été prélevé.';
			phase = 'echec';
		} else if (resultat === 'expire') {
			echecMsg = "Le paiement n'a pas abouti. Tu n'as pas été débité.";
			phase = 'echec';
		} else {
			echecMsg = 'Quelque chose s’est mal passé. Réessaie, tu n’as pas été débité.';
			phase = 'echec';
		}
	}

	// Soumission du code : on affiche « on attend la confirmation… » un délai réaliste
	// avant de révéler le résultat (test de l'attente asynchrone, PRD §8.6).
	function soumettre() {
		erreur = '';
		phase = 'confirmation';
		curtainMsg = 'On attend la confirmation…';
		const t0 = Date.now();
		return async ({ result }: { result: { type: string; data?: Record<string, unknown> } }) => {
			await new Promise((r) => setTimeout(r, Math.max(0, 3000 - (Date.now() - t0))));
			const d = result.type === 'success' ? result.data : undefined;
			appliquer(d?.resultat as string | undefined, (d?.nouveauSolde as number | undefined) ?? null);
		};
	}

	async function copier() {
		try {
			await navigator.clipboard.writeText(data.reference);
			copie = true;
			setTimeout(() => (copie = false), 1800);
		} catch {
			copie = false;
		}
	}
</script>

<svelte:head><title>Paiement — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	{#if data.modeTest}<TestBanner />{/if}

	{#if phase === 'contact' || phase === 'confirmation'}
		<div class="rideau" aria-live="polite">
			<div class="spin" aria-hidden="true"></div>
			<p class="t-body-lg msg">{curtainMsg}</p>
			<p class="t-small ref-ligne">Référence <button class="ref" type="button" onclick={copier}>{data.reference}{copie ? ' ✓' : ''}</button></p>
		</div>
	{:else if phase === 'code'}
		<h1 class="t-h1">Entre ton code</h1>
		<p class="t-body sous">Compose le code Mobile Money reçu sur ton téléphone, puis valide.</p>
		{#if data.modeTest}
			<p class="t-small hint">Test : <b>0000</b> = code refusé · <b>1111</b> = solde insuffisant · autre = succès · ne rien faire = expiration.</p>
		{/if}

		<form method="POST" action="?/confirmer" use:enhance={soumettre}>
			<input type="hidden" name="ref" value={data.reference} />
			<input class="field" name="code" inputmode="numeric" bind:value={code} placeholder="Code opérateur" autocomplete="one-time-code" />
			{#if erreur}<p class="aide t-small" role="alert">{erreur}</p>{/if}
			<button class="btn-primary" type="submit" disabled={code.trim().length === 0}>Valider</button>
		</form>

		<p class="t-small expire">Ce paiement expire dans <b>{mmss}</b>.</p>
		<p class="t-small ref-ligne">Référence <button class="ref" type="button" onclick={copier}>{data.reference}{copie ? ' ✓' : ''}</button></p>
	{:else if phase === 'succes'}
		<div class="succes" aria-live="polite">
			<div class="check" aria-hidden="true">✓</div>
			<p class="t-h2">Paiement confirmé</p>
			{#if nouveauSolde !== null}
				<p class="t-body">Ton solde est maintenant de <b>{nouveauSolde}</b> crédit{nouveauSolde > 1 ? 's' : ''}.</p>
			{/if}
			<a class="btn-outline" href={data.retour}>Continuer</a>
		</div>
	{:else if phase === 'echec'}
		<div class="echec" aria-live="polite">
			<p class="t-h2">Paiement non abouti</p>
			<p class="t-body">{echecMsg}</p>
			<a class="btn-primary" href="/recharge">Réessayer</a>
			<a class="t-small support" href="/aide">J'ai payé mais je n'ai pas reçu mes crédits</a>
		</div>
	{/if}

	{#if phase !== 'succes'}
		<a class="t-small support bas" href="/aide">J'ai payé mais je n'ai pas reçu mes crédits</a>
	{/if}
</main>

<style>
	main { padding-top: var(--s-8); padding-bottom: var(--s-12); display: flex; flex-direction: column; gap: var(--s-5); min-height: 60vh; }
	.sous { color: var(--c-ink-2); margin: 0; }
	.hint { background: var(--c-canvas-sunk); border-radius: var(--r-md); padding: var(--s-2) var(--s-3); color: var(--c-ink-2); }
	.rideau { display: flex; flex-direction: column; align-items: center; gap: var(--s-4); padding: var(--s-10) 0; text-align: center; }
	.spin { width: 44px; height: 44px; border-radius: 50%; border: 4px solid var(--c-line); border-top-color: var(--c-accent); animation: tourne 0.9s linear infinite; }
	@keyframes tourne { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2.4s; } }
	.msg { color: var(--c-ink); margin: 0; }
	.field { width: 100%; height: 52px; padding: 0 var(--s-5); border-radius: var(--r-pill); border: 1px solid var(--c-line); background: var(--c-surface); font-size: 18px; letter-spacing: 2px; margin-bottom: var(--s-3); }
	.field:focus { outline: none; border-color: var(--c-line-strong); box-shadow: 0 0 0 3px var(--c-line-strong); }
	.aide { color: var(--c-rouge); margin: 0 0 var(--s-3); }
	.expire { color: var(--c-ink-2); }
	.ref-ligne { color: var(--c-ink-3); }
	.ref { font-family: var(--font-mono, monospace); font-weight: 700; color: var(--c-ink); background: var(--c-canvas-sunk); border: 1px solid var(--c-line); border-radius: var(--r-sm); padding: 2px 8px; cursor: pointer; }
	.succes { display: flex; flex-direction: column; align-items: center; gap: var(--s-3); text-align: center; padding: var(--s-8) 0; }
	.check { width: 72px; height: 72px; border-radius: 50%; background: var(--c-vert-wash); color: var(--c-vert); display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 800; animation: pop 0.4s ease-out; }
	@keyframes pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
	.echec { display: flex; flex-direction: column; align-items: flex-start; gap: var(--s-3); }
	.support { color: var(--c-ink-2); }
	.support.bas { margin-top: auto; }
</style>
