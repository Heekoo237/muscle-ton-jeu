<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { formatFranc } from '$lib/format';
	import TestBanner from '$lib/components/TestBanner.svelte';
	import { PAYS, paysDe, validerNumero } from '$lib/payments/operators';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let etape = $state<1 | 2>(1);
	// Graine initiale depuis le pays mémorisé ; ensuite l'utilisateur en est maître.
	// svelte-ignore state_referenced_locally
	let paysCode = $state(data.paysDefaut);
	let numero = $state('');
	let operateurId = $state('');
	let packId = $state('');

	const pays = $derived(paysDe(paysCode) ?? PAYS[0]);
	const validation = $derived(validerNumero(numero, pays));
	const pack = $derived(data.packs.find((p) => p.id === packId));

	// Changer de pays remet l'opérateur à zéro (les listes diffèrent).
	function choisirPays(code: string) {
		paysCode = code as typeof paysCode;
		operateurId = '';
	}

	// « X crédits, soit environ Y analyses ». Un ticket courant coûte 1 crédit
	// (2-6 sélections) → 1 pour 1 en ordre de grandeur ; « environ » absorbe le reste.
	function analyses(credits: number | 'illimite'): string {
		return credits === 'illimite'
			? 'analyses illimitées 72 h'
			: `environ ${credits} analyse${credits > 1 ? 's' : ''}`;
	}

	const peutContinuer = $derived(validation.ok && operateurId !== '' && packId !== '');
	const operateur = $derived(pays.operateurs.find((o) => o.id === operateurId));

	function continuer() {
		if (peutContinuer) etape = 2;
	}
</script>

<svelte:head><title>Recharger — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	{#if data.modeTest}
		<TestBanner />
	{/if}

	{#if !data.paiementActif}
		<h1 class="t-h1">Tes analyses offertes sont épuisées</h1>
	{:else if data.besoin > 0 && etape === 1}
		<h1 class="t-h1">Ton ticket est prêt.</h1>
		<p class="t-body-lg sous">
			{data.besoin} crédit{data.besoin > 1 ? 's' : ''} nécessaire{data.besoin > 1 ? 's' : ''}. Il te
			reste {data.credits}.
		</p>
		<p class="t-body garde">Ton ticket est gardé. Tu le retrouveras ici.</p>
	{:else if etape === 1}
		<h1 class="t-h1">Recharger</h1>
	{/if}

	{#if data.message}
		<p class="t-body message" role="note">{data.message}</p>
	{/if}

	{#if data.enCours}
		<div class="encours" role="note">
			<p class="t-body">Une recharge est déjà en cours.</p>
			<a class="btn-outline" href={`/recharge/attente?ref=${data.enCours.reference}`}>Reprendre</a>
		</div>
	{/if}

	{#if form?.message}
		<p class="t-body message" role="alert">{form.message}</p>
	{/if}

	{#if !data.paiementActif}
		<!-- BÊTA : pas de formulaire de recharge (paiement non branché) → on oriente
		     vers le support WhatsApp, sans cul-de-sac. -->
		<a class="btn-primary wa" href={data.supportUrl} target="_blank" rel="noopener">
			Écris-nous sur WhatsApp
		</a>
		<p class="t-body garde">Ton ticket est gardé. Tu le retrouveras dans ton historique.</p>
	{:else if etape === 1}
		<!-- ÉTAPE 1 — saisie -->
		<section class="bloc">
			<span class="lab t-small">Pays</span>
			<div class="pays-liste">
				{#each PAYS as p (p.code)}
					<button
						type="button"
						class="pays-item"
						class:sel={p.code === paysCode}
						onclick={() => choisirPays(p.code)}
					>
						<span class="drapeau">{p.drapeau}</span>
						<span class="pnom">{p.nom}</span>
						<span class="pind t-small">{p.indicatif}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="bloc">
			<label class="lab t-small" for="numero">Ton numéro Mobile Money</label>
			<div class="tel">
				<span class="ind">{pays.indicatif}</span>
				<input
					id="numero"
					class="field"
					inputmode="numeric"
					autocomplete="tel"
					bind:value={numero}
					placeholder={'0'.repeat(pays.longueur)}
				/>
			</div>
			{#if validation.message}
				<p class="aide t-small" role="status">{validation.message}</p>
			{/if}
		</section>

		<section class="bloc">
			<span class="lab t-small">Ton opérateur</span>
			<!-- On ne DÉDUIT jamais : Wave marche sur tout numéro, le Bénin est interopérable.
			     L'utilisateur choisit, explicitement — un geste de plus, zéro erreur. -->
			<div class="ops">
				{#each pays.operateurs as op (op.id)}
					<button
						type="button"
						class="op"
						class:sel={op.id === operateurId}
						style="--op:{op.couleur}; --op-txt:{op.texte === 'clair' ? '#fff' : '#111'}"
						onclick={() => (operateurId = op.id)}
					>
						{op.nom}
					</button>
				{/each}
			</div>
		</section>

		<section class="bloc">
			<span class="lab t-small">Montant</span>
			<div class="packs">
				{#each data.packs as p (p.id)}
					<button
						type="button"
						class="pack"
						class:sel={p.id === packId}
						class:featured={data.besoin > 0 && p.id === 'ticket'}
						onclick={() => (packId = p.id)}
					>
						<span class="pnom2 t-h3">{p.nom}</span>
						<span class="prix t-chiffre-md">{formatFranc(p.prix)}</span>
						<span class="contenu t-body">
							{p.credits === 'illimite' ? 'Illimité 72 h' : `${p.credits} crédits`}
						</span>
						<span class="analyses t-small">{analyses(p.credits)}</span>
					</button>
				{/each}
			</div>
		</section>

		<button class="btn-primary continuer" disabled={!peutContinuer} onclick={continuer}>
			Continuer
		</button>
	{:else}
		<!-- ÉTAPE 2 — récapitulatif -->
		<h1 class="t-h1">Vérifie avant de payer</h1>
		{#if data.modeTest}<p class="t-small sous">Aucun paiement réel ne sera effectué.</p>{/if}

		<div class="recap">
			<div class="ligne"><span class="k t-body">Montant</span><span class="v t-chiffre-md">{formatFranc(pack?.prix ?? 0)}</span></div>
			<div class="ligne"><span class="k t-body">Numéro</span><span class="v t-body">{pays.indicatif} {validation.valeur}</span></div>
			<div class="ligne">
				<span class="k t-body">Opérateur</span>
				<span class="v op-tag" style="--op:{operateur?.couleur}; --op-txt:{operateur?.texte === 'clair' ? '#fff' : '#111'}">{operateur?.nom}</span>
			</div>
			<div class="ligne recu">
				<span class="k t-body">Tu reçois</span>
				<span class="v t-body">
					{pack?.credits === 'illimite' ? 'Crédits illimités' : `${pack?.credits} crédits`}, soit {analyses(pack?.credits ?? 0)}
				</span>
			</div>
		</div>

		<form method="POST" action="?/payer" use:enhance>
			<input type="hidden" name="pays" value={pays.code} />
			<input type="hidden" name="numero" value={validation.valeur} />
			<input type="hidden" name="operateur" value={operateurId} />
			<input type="hidden" name="pack" value={packId} />
			<input type="hidden" name="retour" value={data.retour} />
			<button class="btn-primary" type="submit">Payer {formatFranc(pack?.prix ?? 0)}</button>
		</form>
		<button class="btn-dark modifier" type="button" onclick={() => (etape = 1)}>Modifier</button>
	{/if}

	<div class="liens-bas">
		<a class="t-small" href="/dashboard/recharges">Mes recharges</a>
		<a class="t-small support" href="/aide">J'ai payé mais je n'ai pas reçu mes crédits</a>
	</div>
</main>

<style>
	main { padding-top: var(--s-6); padding-bottom: var(--s-12); display: flex; flex-direction: column; gap: var(--s-5); }
	.sous { color: var(--c-ink-2); margin: 0; }
	.garde { color: var(--c-ink-2); margin: 0; }
	.message { background: var(--c-ocre-wash); border: 1px solid var(--c-ocre-line); border-radius: var(--r-md); padding: var(--s-3) var(--s-4); color: var(--c-ink); margin: 0; }
	.encours { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); background: var(--c-canvas-sunk); border-radius: var(--r-md); padding: var(--s-3) var(--s-4); }
	.bloc { display: flex; flex-direction: column; gap: var(--s-2); }
	.lab { color: var(--c-ink-2); font-weight: 600; }
	.pays-liste { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2); }
	.pays-item { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-3); border: 1px solid var(--c-line); border-radius: var(--r-md); background: var(--c-surface); text-align: left; }
	.pays-item.sel { border-color: var(--c-ink); border-width: 2px; }
	.drapeau { font-size: 20px; }
	.pnom { flex: 1; }
	.pind { color: var(--c-ink-3); }
	.tel { display: flex; align-items: center; gap: var(--s-2); }
	.ind { padding: 0 var(--s-3); height: 52px; display: flex; align-items: center; border: 1px solid var(--c-line); border-radius: var(--r-pill); background: var(--c-canvas-sunk); color: var(--c-ink-2); font-weight: 600; }
	.field { flex: 1; height: 52px; padding: 0 var(--s-5); border-radius: var(--r-pill); border: 1px solid var(--c-line); background: var(--c-surface); font-family: var(--font-body); font-size: 16px; }
	.field:focus { outline: none; border-color: var(--c-line-strong); box-shadow: 0 0 0 3px var(--c-line-strong); }
	.aide { color: var(--c-ocre); }
	.ops { display: flex; flex-wrap: wrap; gap: var(--s-2); }
	.op { padding: var(--s-3) var(--s-4); border-radius: var(--r-pill); border: 2px solid transparent; background: var(--op); color: var(--op-txt); font-weight: 700; opacity: 0.55; }
	.op.sel { opacity: 1; border-color: var(--c-ink); }
	.packs { display: flex; flex-direction: column; gap: var(--s-3); }
	.pack { position: relative; display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'nom prix' 'contenu prix' 'analyses analyses'; gap: var(--s-1) var(--s-3); text-align: left; background: var(--c-surface); border: 1px solid var(--c-line); border-radius: var(--r-lg); padding: var(--s-5); }
	.pack.sel { border-color: var(--c-ink); border-width: 2px; }
	.pack.featured { border-top: 3px solid var(--c-accent-line); }
	.pnom2 { grid-area: nom; }
	.prix { grid-area: prix; align-self: center; }
	.contenu { grid-area: contenu; color: var(--c-ink-2); }
	.analyses { grid-area: analyses; color: var(--c-ink-3); }
	.continuer:disabled { opacity: 0.5; }
	.recap { display: flex; flex-direction: column; gap: var(--s-3); background: var(--c-surface); border: 1px solid var(--c-line); border-radius: var(--r-lg); padding: var(--s-5); }
	.ligne { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); }
	.ligne .k { color: var(--c-ink-2); }
	.recu { border-top: 1px solid var(--c-line); padding-top: var(--s-3); }
	.op-tag { padding: var(--s-1) var(--s-3); border-radius: var(--r-pill); background: var(--op); color: var(--op-txt); font-weight: 700; }
	.modifier { margin-top: var(--s-2); }
	.liens-bas { display: flex; justify-content: space-between; gap: var(--s-4); margin-top: var(--s-6); }
	.liens-bas a { color: var(--c-ink-2); }
</style>
