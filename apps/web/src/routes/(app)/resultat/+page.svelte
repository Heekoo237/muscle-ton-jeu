<script lang="ts">
	// Écran de résultat. La comparaison « Ton ticket » / « Ton ticket renforcé »
	// est en vue PAPIER (même langage que la landing) ; tout le reste est conservé :
	// analyse, verdict, lecture détaillée match par match, partage, recharge,
	// notifications, bandeau d'historique.
	import type { PageData } from './$types';
	import ResultBody from '$lib/components/ResultBody.svelte';
	import HistoryMarquee from '$lib/components/HistoryMarquee.svelte';
	import ShareSheet from '$lib/components/ShareSheet.svelte';
	import { onMount } from 'svelte';
	import { activerNotifications, pushCapability, envoyerTest, type PushEtat } from '$lib/push';

	let { data }: { data: PageData } = $props();
	const vm = $derived(data.vm);

	// Notifications : capacité calculée côté navigateur (jamais au SSR). Refus =
	// on ne redemande jamais (l'état 'refuse' n'offre pas de bouton).
	let notifEtat = $state<PushEtat | 'chargement'>('chargement');
	let enCours = $state(false);
	let testEnvoye = $state(false);
	let notifErreur = $state(false);
	onMount(() => {
		notifEtat = pushCapability();
	});
	async function activer() {
		enCours = true;
		notifErreur = false;
		const r = await activerNotifications();
		enCours = false;
		if (r === 'ok') notifEtat = 'active';
		else if (r === 'refuse') notifEtat = 'refuse';
		else if (r === 'non-supporte') notifEtat = 'non-supporte';
		else notifErreur = true;
	}
	async function test() {
		enCours = true;
		testEnvoye = await envoyerTest();
		enCours = false;
	}

	let shareOpen = $state(false);

	/** « il y a 5 min », « il y a 1 h », « il y a 2 j » — durée depuis l'analyse. */
	function ilYa(ms: number): string {
		const min = Math.round(Math.max(0, Date.now() - ms) / 60000);
		if (min < 1) return "à l'instant";
		if (min < 60) return `il y a ${min} min`;
		const h = Math.round(min / 60);
		if (h < 24) return `il y a ${h} h`;
		return `il y a ${Math.round(h / 24)} j`;
	}
</script>

<svelte:head><title>Ton ticket, lu — Muscle Ton Jeu</title></svelte:head>

<main class="container">
	<div class="tete">
		<h1 class="t-h1">Ton ticket, lu</h1>
		{#if data.gratuit}<span class="offert t-small">Offert</span>{/if}
	</div>

	{#if data.reutilise}
		<!-- Réutilisation VISIBLE : même capture déjà analysée, non refacturée. Le
		     piège qui coûtait du temps — on le dit, avec une sortie claire. -->
		<div class="reutilise" role="note">
			<p class="t-body">
				Tu as déjà analysé ce ticket {ilYa(data.analyseLeMs)}. Voici ton résultat, il n'est pas
				refacturé.
			</p>
			<a class="btn-outline" href="/analyser">Analyser une autre capture</a>
		</div>
	{/if}

	{#if data.donneesIncompletes}
		<!-- Trou de données TRANSITOIRE : on ne facture pas un service non rendu, et on
		     invite au retour. Le message disparaît de lui-même quand la donnée arrive. -->
		<div class="incomplet" role="note">
			<p class="t-body">
				{data.nbSansDonnee > 1
					? `${data.nbSansDonnee} matchs n'avaient`
					: "Un match n'avait"} pas encore ses données. On ne te l'a pas facturé. Reviens
				plus tard pour l'analyse complète — gratuite sous 24 h avec le même ticket.
			</p>
		</div>
	{/if}

	<ResultBody {vm} />

	<!-- Actions : une seule action accent (Partager) ; relancer une analyse est
	     une progression neutre (bouton sombre). Plus de « modifier » : l'analyse
	     est faite. « Analyser un autre ticket » suit la logique de facturation
	     habituelle (gratuit si éligible, sinon crédits, sinon blocage à l'affichage). -->
	<div class="actions">
		<button class="btn-primary" type="button" onclick={() => (shareOpen = true)}>Partager</button>
		<a class="btn-dark" href="/analyser">Analyser un autre ticket</a>
	</div>

	{#if data.montreRecharge}
		<!-- Invitation à recharger : après l'analyse offerte, sans pression avant. -->
		<div class="recharge-invite">
			<p class="t-body">Pour continuer à muscler tes tickets, recharge à partir de 500 F.</p>
			<a class="btn-outline" href="/recharge">Recharger</a>
		</div>
	{/if}

	<!-- Rétention : opt-in notifications (PRD §10). Demande au PIC émotionnel (résultat),
	     jamais à l'arrivée. Refus = on ne redemande jamais. Cas iOS géré explicitement. -->
	<div class="notif">
		{#if notifEtat === 'active'}
			<p class="t-body ok">On te prévient quand ton ticket est joué.</p>
			{#if !testEnvoye}
				<button class="btn-outline" type="button" onclick={test} disabled={enCours}>
					Recevoir une notification de test
				</button>
			{:else}
				<p class="t-small texte">Notification de test envoyée. Regarde ton téléphone.</p>
			{/if}
		{:else if notifEtat === 'ios-a-installer'}
			<p class="t-body texte">On te prévient quand ton ticket est joué.</p>
			<p class="t-small texte">
				Sur iPhone, ajoute d'abord Muscle Ton Jeu à ton écran d'accueil (bouton Partager → « Sur
				l'écran d'accueil »), puis reviens ici pour activer.
			</p>
		{:else if notifEtat === 'refuse'}
			<p class="t-small texte">
				Les notifications sont bloquées pour ce site. Tu peux les réautoriser dans les réglages de
				ton navigateur.
			</p>
		{:else if notifEtat === 'pret'}
			<p class="t-body texte">On te prévient quand ton ticket est joué ?</p>
			<button class="btn-outline" type="button" onclick={activer} disabled={enCours}>
				{enCours ? 'Activation…' : 'Activer les notifications'}
			</button>
			{#if notifErreur}
				<p class="t-small texte">Ça n'a pas marché. Réessaie dans un instant.</p>
			{/if}
		{/if}
		<!-- 'non-supporte' / 'chargement' : on n'affiche rien (pas d'échec, pas de bruit). -->
	</div>

	{#if data.historique.length >= 20}
		<!-- Bandeau d'historique réel : sélections marquées, matchs terminés, issue
		     réelle (les défavorables comprises). Absent tant qu'il y a moins de 20
		     résultats en base — jamais de remplissage de démonstration. -->
		<HistoryMarquee items={data.historique} />
	{/if}
</main>

{#if shareOpen}
	<ShareSheet imageUrl={data.shareImage} shareUrl={data.shareUrl} onClose={() => (shareOpen = false)} />
{/if}

<style>
	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
	.tete {
		display: flex;
		align-items: center;
		gap: var(--s-3);
	}
	.tete h1 {
		margin: 0;
	}
	.offert {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-canvas-sunk);
		color: var(--c-ink-3);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}

	/* ---- Actions ---- */
	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.btn-dark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		text-decoration: none;
		transition: transform 100ms ease-out;
	}
	.btn-dark:active {
		transform: scale(0.98);
	}
	@media (min-width: 600px) {
		.actions {
			flex-direction: row;
		}
		.actions .btn-primary,
		.actions .btn-dark {
			flex: 1;
		}
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
		text-decoration: none;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.reutilise {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		align-items: flex-start;
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.incomplet {
		background: var(--c-ocre-wash);
		border: 1px solid var(--c-ocre-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.incomplet .t-body {
		margin: 0;
		color: var(--c-ink);
	}
	.reutilise .t-body {
		margin: 0;
		color: var(--c-ink-2);
	}
	.recharge-invite {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		align-items: flex-start;
		background: var(--c-canvas-sunk);
		border-radius: var(--r-md);
		padding: var(--s-4);
	}
	.recharge-invite .t-body {
		color: var(--c-ink-2);
		margin: 0;
	}
	.notif {
		padding-top: var(--s-4);
		border-top: 1px solid var(--c-line);
	}
	.notif .texte {
		color: var(--c-ink-2);
		margin: 0 0 var(--s-3);
	}
	.notif .ok {
		color: var(--c-ink-2);
		margin: 0;
	}
	.btn-outline {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 52px;
		padding: 0 var(--s-6);
		border-radius: var(--r-pill);
		background: transparent;
		color: var(--c-ink);
		border: 1px solid var(--c-line-strong);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.btn-outline:active {
		transform: scale(0.98);
	}
</style>
