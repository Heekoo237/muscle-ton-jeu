<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import LegalNote from '$lib/components/LegalNote.svelte';
	import PaperTicketCompare from '$lib/components/PaperTicketCompare.svelte';
	import { ligneNote } from '$lib/lineStatus';

	let { data }: { data: PageData } = $props();

	// Suppression à DEUX temps : un tap révèle la confirmation, il n'efface jamais
	// directement (un geste accidentel ne doit pas supprimer une analyse payée).
	let confirmSuppr = $state(false);
	let suppression = $state(false);

	const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
	const courtFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
	const dateLabel = $derived(dateFmt.format(new Date(data.dateMs)));

	function pctBig(v: number): string {
		return `${v.toString().replace('.', ',')} %`;
	}

	const nbFragiles = $derived(data.lignes.filter((l) => l.fragile).length);
	// « la plus fragile » n'a de sens que s'il n'y a QU'UN retrait (cf. lineStatus).
	const retraitUnique = $derived(data.lignes.filter((l) => l.retiree).length === 1);

	// Verdict du règlement : c'est ce que l'utilisateur vient voir en cliquant la
	// notification. Le cas « tombé mais le renforcé serait passé » est notre argument.
	const regle = $derived(data.verdict === 'passe' || data.verdict === 'tombe');
	const verdictPhrase = $derived(
		data.verdict === 'passe'
			? 'Ton ticket est passé. Bien joué.'
			: data.verdict === 'tombe'
				? data.verdictRenforce
					? `Ton ticket est tombé${data.tombeSur ? ` sur ${data.tombeSur}` : ''}. Le renforcé serait passé.`
					: `Ton ticket est tombé${data.tombeSur ? ` sur ${data.tombeSur}` : ''}.`
				: ''
	);
	function issueDe(ordre: number): 'passe' | 'tombe' | 'attente' | undefined {
		return data.issues?.[ordre];
	}
	// Toutes les lignes, non analysées comprises : neutres, jamais retirées.
	// « analysable » côté papier = réellement analysée (résolue ET avec proba).
	const paperLines = $derived(
		data.lignes.map((l) => ({
			matchLabel: l.matchLabel,
			libelleFr: l.libelleFr,
			fragile: l.fragile,
			retiree: l.retiree,
			mentionNeutre: l.mentionNeutre,
			// Booléen déjà tranché côté serveur (règle unique isAnalysable) — on le lit.
			analysable: l.analysable
		}))
	);
</script>

<svelte:head><title>Analyse du {dateLabel} — Muscle Ton Jeu</title></svelte:head>

<div class="wrap">
	<div class="tete">
		<a class="retour" href="/dashboard/historique">‹ Mon historique</a>
		<h1 class="t-h1">Ton ticket, lu</h1>
		<p class="t-small sous">{dateLabel} · {data.nbMatchs} match{data.nbMatchs > 1 ? 's' : ''} · consultable à vie</p>
	</div>

	{#if data.verdict === 'indisponible' || data.verdict === 'sans_reglement' || data.verdict === 'orientation_incertaine'}
		<!-- Statut honnête : le ticket ne se réglera jamais (ou pas avec certitude). On le
		     DIT, on ne le laisse pas « en attente » à vie, et on ne pose JAMAIS un verdict
		     douteux (orientation incertaine du match). -->
		<div class="bilan neutre" role="status">
			<p class="bilan-txt">
				{data.verdict === 'indisponible'
					? "On n'a pas pu récupérer le résultat de ce match. Il ne sera pas réglé."
					: data.verdict === 'orientation_incertaine'
						? "On vérifie l'ordre des équipes sur un de ces matchs. On préfère ne rien afficher plutôt qu'un résultat douteux."
						: 'Aucun match à vérifier dans ce ticket.'}
			</p>
		</div>
	{/if}

	{#if regle}
		<!-- Verdict du ticket réglé : la première chose vue en arrivant depuis la
		     notification. « Le renforcé serait passé » est mis en avant. -->
		<div
			class="bilan"
			class:passe={data.verdict === 'passe'}
			class:tombe={data.verdict === 'tombe'}
			class:sauve={data.verdictRenforce}
			role="status"
		>
			<p class="bilan-txt">{verdictPhrase}</p>
		</div>
	{/if}

	{#if data.synthese}
		<p class="t-body-lg analyse">{data.synthese}</p>
	{/if}

	{#if data.explications.length > 0}
		<div class="explications">
			{#each data.explications as e (e.ordre)}
				<article class="exp" class:badge={e.avecBadge}>
					<div class="exp-match">
						{e.matchLabel}{#if e.avecBadge}&nbsp;<span class="tri" aria-hidden="true">▲</span>{/if}
					</div>
					<div class="exp-marche" class:oc={e.avecBadge}>{e.libelleFr}</div>
					<p class="exp-texte">{e.texte}</p>
					{#if e.autresIssues.length > 0}
						<!-- Sur ce match : les paris les plus probables (parité écran de résultat).
						     On MONTRE, jamais « joue ça ». Présent tant que le ticket n'est pas réglé. -->
						<div class="autres">
							<div class="autres-t">
								{e.chancesCotes
									? 'Sur ce match, d’après les cotes'
									: 'Sur ce match, voici ce que disent les chances'}
							</div>
							{#each e.autresIssues as iss (iss.libelleFr)}
								<div class="autres-l">
									<span>{iss.libelleFr}</span>
									<span class="autres-n">{pctBig(iss.probabilitePct)}</span>
								</div>
							{/each}
							{#if e.chancesCotes}
								<div class="autres-note">On n’a pas encore étudié ce championnat.</div>
							{/if}
						</div>
					{/if}
				</article>
			{/each}
		</div>
	{/if}

	<!-- Comparaison en tickets papier (même design que le résultat) -->
	<PaperTicketCompare
		lines={paperLines}
		probaTotalePct={data.probaTotalePct}
		probaRenforceePct={data.probaRenforceePct}
		dateLabel={courtFmt.format(new Date(data.dateMs))}
	/>

	<!-- Ligne de verdict -->
	<div class="verdict">
		{#if data.nbRetirees === 0}
			<div class="t-body-lg">Rien à retirer. Ton ticket tenait debout.</div>
		{:else}
			<div class="t-body-lg">
				{data.nbRetirees} match{data.nbRetirees > 1 ? 's' : ''} retiré{data.nbRetirees > 1 ? 's' : ''}.
				Tes chances passaient de <span class="v">{pctBig(data.probaTotalePct)}</span> à
				<span class="v">{pctBig(data.probaRenforceePct)}</span>.
			</div>
		{/if}
		<LegalNote />
	</div>

	<!-- Match par match -->
	<section class="mpm">
		<div class="mpm-head">
			<h2 class="t-h2">Match par match</h2>
			{#if nbFragiles > 0}
				<span class="mpm-badge">{nbFragiles} trop juste{nbFragiles > 1 ? 's' : ''}</span>
			{/if}
		</div>
		{#each data.lignes as l (l.ordre)}
			<article class="mpm-card" class:fragile={l.fragile} class:removed={l.retiree} class:serree={l.serree}>
				<div class="mpm-top">
					<span class="mpm-match">
						{l.matchLabel}{#if l.fragile}&nbsp;<span class="tri">▲</span>{/if}{#if l.serree}&nbsp;<span
								class="serre-tag">serré</span
							>{/if}
					</span>
					{#if issueDe(l.ordre) === 'passe'}
						<span class="issue passe">passé</span>
					{:else if issueDe(l.ordre) === 'tombe'}
						<span class="issue tombe">tombé</span>
					{:else if l.analysable && l.probabilitePct != null}
						<span class="mpm-pct">{pctBig(l.probabilitePct)}</span>
					{:else}
						<span class="mpm-na">pas d’avis</span>
					{/if}
				</div>
				<div class="mpm-marche" class:oc={l.fragile}>{l.libelleFr}</div>
				<div class="mpm-note">{ligneNote(l, { retraitUnique })}</div>
			</article>
		{/each}
	</section>

	<a class="btn-primary" href="/analyser">Analyser un nouveau ticket</a>

	<!-- Suppression : discrète (pas une action mise en avant), à DEUX temps. -->
	<section class="suppr">
		{#if !confirmSuppr}
			<button type="button" class="suppr-lien" onclick={() => (confirmSuppr = true)}>
				Supprimer cette analyse
			</button>
		{:else}
			<div class="suppr-panel">
				<p class="t-small">
					Retirer cette analyse de ton historique&nbsp;? C'est définitif. Les crédits déjà
					utilisés ne sont pas remboursés.
				</p>
				<div class="suppr-actions">
					<button type="button" class="annuler" onclick={() => (confirmSuppr = false)}>Annuler</button>
					<form
						method="POST"
						action="?/supprimer"
						use:enhance={() => {
							suppression = true;
							return async ({ update }) => {
								await update();
								suppression = false;
							};
						}}
					>
						<button type="submit" class="confirmer" disabled={suppression}>
							{suppression ? 'Suppression…' : 'Oui, supprimer'}
						</button>
					</form>
				</div>
			</div>
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 940px;
		margin-inline: auto;
		padding: var(--s-6) var(--s-4) var(--s-10);
		display: flex;
		flex-direction: column;
		gap: var(--s-6);
	}
	/* Bandeau de verdict du ticket réglé — la première chose vue depuis la notif. */
	.bilan {
		padding: var(--s-4) var(--s-5);
		border-radius: var(--r-md);
		border: 1px solid var(--c-line);
	}
	.bilan.neutre {
		background: var(--c-canvas-sunk);
	}
	/* Suppression : volontairement discrète — jamais un accent, jamais un piège. */
	.suppr {
		margin-top: var(--s-2);
		display: flex;
		justify-content: center;
	}
	.suppr-lien {
		background: none;
		border: none;
		color: var(--c-ink-3);
		font-size: 14px;
		text-decoration: underline;
		cursor: pointer;
		padding: var(--s-2);
	}
	.suppr-panel {
		width: 100%;
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
		background: var(--c-surface);
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.suppr-panel p {
		margin: 0;
		color: var(--c-ink-2);
	}
	.suppr-actions {
		display: flex;
		gap: var(--s-3);
		align-items: center;
	}
	.suppr-actions form {
		margin: 0;
	}
	.annuler {
		background: none;
		border: 1px solid var(--c-line);
		border-radius: var(--r-sm);
		padding: var(--s-2) var(--s-4);
		color: var(--c-ink);
		cursor: pointer;
	}
	.confirmer {
		background: var(--c-rouge);
		border: none;
		border-radius: var(--r-sm);
		padding: var(--s-2) var(--s-4);
		color: #fff;
		cursor: pointer;
	}
	.confirmer:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.bilan.passe {
		background: var(--c-vert-wash);
		border-color: var(--c-vert);
	}
	.bilan.tombe {
		background: var(--c-rouge-wash);
		border-color: var(--c-rouge);
	}
	/* Tombé MAIS le renforcé aurait tenu : on sort du rouge, c'est notre argument. */
	.bilan.tombe.sauve {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre);
	}
	.bilan-txt {
		margin: 0;
		font-family: var(--font-title);
		font-size: 18px;
		color: var(--c-ink);
	}
	.issue {
		font-weight: 700;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	.issue.passe {
		color: var(--c-vert);
	}
	.issue.tombe {
		color: var(--c-rouge);
	}
	.tete {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.tete h1 {
		margin: 0;
	}
	.retour {
		font-size: 14px;
		font-weight: 600;
		color: var(--c-ink-2);
		text-decoration: none;
	}
	.sous {
		color: var(--c-ink-3);
		margin: 0;
	}
	.analyse {
		color: var(--c-ink-2);
		margin: 0;
		max-width: var(--measure);
	}

	/* Explications par sélection retirée (niveau 2) */
	.explications {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.exp {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.exp.badge {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.exp-match {
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	.exp-match .tri {
		color: var(--c-ocre);
		font-size: 13px;
	}
	.exp-marche {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.exp-marche.oc {
		color: var(--c-ocre);
	}
	.exp-texte {
		margin: var(--s-1) 0 0;
		font-size: 15px;
		line-height: 1.45;
		color: var(--c-ink);
		max-width: var(--measure);
	}
	.autres {
		margin-top: var(--s-3);
		padding-top: var(--s-2);
		border-top: 1px solid var(--c-line);
	}
	.autres-t {
		font-size: 13px;
		color: var(--c-ink-2);
		margin-bottom: var(--s-1);
	}
	.autres-l {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
		font-size: 14px;
		padding: 2px 0;
	}
	.autres-n {
		font-variant-numeric: tabular-nums;
		color: var(--c-ink-2);
	}
	.autres-note {
		margin-top: var(--s-2);
		font-size: 12px;
		color: var(--c-ink-mute);
	}
	/* « serré » : marqueur NEUTRE (gris), jamais l'ocre du fragile ni le barré du retiré. */
	.serre-tag {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--c-ink-3);
		background: var(--c-canvas-sunk);
		border: 1px solid var(--c-line);
		border-radius: 999px;
		padding: 1px 7px;
		vertical-align: middle;
	}
	.mpm-card.serree {
		border-left: 3px solid var(--c-line-strong);
	}

	.verdict {
		background: var(--c-accent-wash);
		border: 1px solid var(--c-accent-line);
		border-radius: var(--r-md);
		padding: var(--s-5) var(--s-4);
	}
	.verdict .v {
		font-weight: 600;
		font-feature-settings: 'tnum' 1;
	}

	/* Match par match */
	.mpm {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
	}
	.mpm-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
	}
	.mpm-head .t-h2 {
		margin: 0;
	}
	.mpm-badge {
		display: inline-flex;
		align-items: center;
		height: 28px;
		padding: 0 var(--s-3);
		border-radius: var(--r-pill);
		background: var(--c-ocre-wash);
		border: 1px solid var(--c-ocre-line);
		color: var(--c-ocre);
		font-size: 14px;
		font-weight: 600;
	}
	.mpm-card {
		display: flex;
		flex-direction: column;
		gap: var(--s-1);
		padding: var(--s-4);
		background: var(--c-surface);
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
	}
	.mpm-card.fragile {
		background: var(--c-ocre-wash);
		border-color: var(--c-ocre-line);
		border-left: 3px solid var(--c-ocre);
	}
	.mpm-card.removed {
		background: var(--c-canvas-sunk);
	}
	.mpm-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.mpm-match {
		font-size: 16px;
		font-weight: 600;
		color: var(--c-ink);
	}
	.mpm-match .tri {
		color: var(--c-ocre);
		font-size: 13px;
	}
	.mpm-pct {
		flex: 0 0 auto;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 22px;
		letter-spacing: -0.4px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.mpm-na {
		flex: 0 0 auto;
		font-size: 14px;
		color: var(--c-ink-3);
	}
	.mpm-marche {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.mpm-marche.oc {
		color: var(--c-ocre);
	}
	.mpm-note {
		font-size: 14px;
		color: var(--c-ink-3);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 360px;
		height: 52px;
		border-radius: var(--r-pill);
		background: var(--c-accent);
		color: var(--c-ink-inverse);
		font-weight: 600;
		text-decoration: none;
		transition: transform 100ms ease-out;
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
</style>
