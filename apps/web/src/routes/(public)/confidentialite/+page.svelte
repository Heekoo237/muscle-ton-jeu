<script lang="ts">
	import BadgeAge from '$lib/components/BadgeAge.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Confidentialité — Muscle Ton Jeu</title>
	<meta
		name="description"
		content="Ce qu'on collecte, pourquoi, combien de temps, et tes droits. On ne vend jamais tes données. 18+."
	/>
</svelte:head>

<main class="container measure">
	<div class="tete">
		<h1 class="t-h1">Politique de confidentialité</h1>
		<BadgeAge />
	</div>
	<p class="t-body-lg">
		Voici ce qu'on garde sur toi, pourquoi, et comment tu gardes la main. En clair,
		sans jargon.
	</p>

	<h2 class="t-h2">Ce qu'on collecte</h2>
	<p class="t-body">Quand tu crées un compte avec Google :</p>
	<ul class="t-body liste">
		<li>Ton adresse e-mail</li>
		<li>Ton prénom</li>
		<li>Ton identifiant Google</li>
	</ul>
	<p class="t-body">Quand tu analyses un ticket :</p>
	<ul class="t-body liste">
		<li>La capture d'écran que tu envoies</li>
		<li>Les matchs et les paris qu'elle contient</li>
		<li>Le résultat de l'analyse</li>
	</ul>
	<p class="t-body">Quand tu recharges :</p>
	<ul class="t-body liste">
		<li>Ton numéro de téléphone</li>
		<li>Ton opérateur et ton pays</li>
		<li>Le montant</li>
	</ul>
	<p class="t-body">
		On ne collecte rien d'autre. Pas de localisation, pas de contacts, pas d'accès à
		tes autres applications.
	</p>

	<h2 class="t-h2">Pourquoi</h2>
	<ul class="t-body liste">
		<li>Ton e-mail et ton prénom : pour te reconnaître à la connexion.</li>
		<li>Ta capture : pour lire ton ticket. Elle est supprimée après 30 jours.</li>
		<li>Tes analyses : pour que tu les retrouves dans ton historique.</li>
		<li>Ton numéro : uniquement pour traiter ta recharge.</li>
	</ul>

	<h2 class="t-h2">Combien de temps on les garde</h2>
	<ul class="t-body liste">
		<li>Captures d'écran : 30 jours, puis suppression automatique.</li>
		<li>Analyses et historique : tant que ton compte existe.</li>
		<li>Données de recharge : conservées pour la comptabilité.</li>
	</ul>

	<h2 class="t-h2">Qui y a accès</h2>
	<p class="t-body">
		Personne d'autre que nous. On ne vend pas tes données. On ne les partage avec
		aucun annonceur.
	</p>
	<p class="t-body">Trois prestataires techniques les traitent pour nous :</p>
	<ul class="t-body liste">
		<li><strong>Supabase</strong> : stockage de la base de données.</li>
		<li><strong>Vercel</strong> : hébergement du site.</li>
		<li><strong>Anthropic</strong> : lecture de ta capture d'écran.</li>
	</ul>
	<p class="t-body">
		Ils sont soumis à des obligations de confidentialité. Ils n'utilisent pas tes
		données pour autre chose.
	</p>

	<h2 class="t-h2">Tes droits</h2>
	<p class="t-body">À tout moment, tu peux :</p>
	<ul class="t-body liste">
		<li>Demander ce qu'on a sur toi.</li>
		<li>Demander la correction d'une information.</li>
		<li>Demander la suppression de ton compte et de tout ce qui va avec.</li>
	</ul>
	<p class="t-body">
		Écris-nous sur <a href={data.supportUrl}>WhatsApp</a>. On répond en 48 heures.
	</p>

	<h2 class="t-h2">Ton historique public</h2>
	<p class="t-body">
		Certaines analyses peuvent apparaître dans notre historique public, pour montrer
		comment le système travaille. Elles sont <strong>toujours anonymes</strong> :
		aucun nom, aucun e-mail, aucun numéro. Juste les matchs et les chiffres.
	</p>

	<h2 class="t-h2">Cookies</h2>
	<p class="t-body">
		On utilise le strict nécessaire : ta session de connexion, et ton choix de pays
		pour la recharge. Pas de cookie publicitaire, pas de traçage.
	</p>

	<h2 class="t-h2">Jeu responsable</h2>
	<p class="t-body">
		Ce site est réservé aux personnes majeures. Le pari sportif peut créer une
		dépendance. Si tu penses jouer plus que tu ne devrais,
		<a href="/jeu-responsable">parles-en à quelqu'un</a>.
	</p>

	<h2 class="t-h2">Contact</h2>
	<ul class="t-body liste">
		<li>WhatsApp : <a href={data.supportUrl}>écris-nous</a></li>
		{#if data.email}
			<li>E-mail : <a href={`mailto:${data.email}`}>{data.email}</a></li>
		{/if}
	</ul>

	<p class="t-small maj">Dernière mise à jour : {data.majLe}</p>
</main>

<style>
	.tete {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: var(--s-4);
	}
	main {
		padding-top: var(--s-8);
	}
	.t-body-lg {
		color: var(--c-ink-2);
	}
	.t-h2 {
		margin-top: var(--s-8);
	}
	.liste {
		color: var(--c-ink-2);
		padding-left: var(--s-5);
	}
	.liste li {
		margin: var(--s-2) 0;
	}
	p.t-body {
		color: var(--c-ink-2);
	}
	.maj {
		margin-top: var(--s-8);
		color: var(--c-ink-3);
	}
</style>
