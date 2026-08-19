<script lang="ts">
	// Carte d'un ticket public : lignes retirées (barrées, avec cote) + lignes gardées,
	// cote combinée (produit des cotes gardées — un FAIT, pas une proba ni un gain), et
	// verdict factuel AU PASSÉ. Anonyme (« Ticket de 21h40 »), jamais de conseil.
	import type { TicketPublicVM } from '../../routes/(public)/historique/+page.server';
	import { formatCote } from '$lib/format';

	let { t }: { t: TicketPublicVM } = $props();

	const retireesTombees = $derived(t.lignes.filter((l) => l.retiree && l.tombe === true));
	const verdict = $derived(construireVerdict());
	function construireVerdict(): string {
		if (t.bascule === 'sauve') {
			const noms = retireesTombees.map((l) => l.matchLabel);
			const quoi = noms.length
				? `${noms.join(', ')} ${noms.length > 1 ? 'ont perdu' : 'a perdu'}. `
				: '';
			return `${quoi}Sans ${noms.length > 1 ? 'ces lignes' : 'cette ligne'}, le ticket passait.`;
		}
		if (t.bascule === 'tombe_malgre') return 'Une ligne gardée est tombée. Le retrait n’a pas suffi.';
		return 'Ce ticket passait déjà. Le retrait n’a rien changé.';
	}
</script>

<article class="ex" data-bascule={t.bascule}>
	<header class="ex-head">
		<span class="ex-date">Ticket de {t.dateLabel}</span>
		<span class="ex-tag" data-bascule={t.bascule}>
			{t.bascule === 'sauve'
				? 'sauvé par le retrait'
				: t.bascule === 'tombe_malgre'
					? 'retrait insuffisant'
					: 'passait déjà'}
		</span>
	</header>

	<ul class="ex-lignes">
		{#each t.lignes as l (l.matchLabel + l.libelleFr)}
			<li class="l" class:retiree={l.retiree}>
				<div class="l-mid">
					<span class="l-match" class:strike={l.retiree}>{l.matchLabel}</span>
					<span class="l-marche" class:strike={l.retiree}>{l.libelleFr}</span>
					{#if l.retiree}<span class="l-note">Retiré — trop juste</span>{/if}
				</div>
				{#if l.cote != null}
					<span class="l-cote" class:strike={l.retiree}>{formatCote(l.cote)}</span>
				{/if}
			</li>
		{/each}
	</ul>

	{#if t.coteCombinee != null}
		<div class="ex-cote">
			<span class="cc-label">Cote combinée après retrait</span>
			<span class="cc-val">{formatCote(t.coteCombinee)}</span>
		</div>
	{/if}

	<p class="ex-verdict">{verdict}</p>
</article>

<style>
	.ex {
		border: 1px solid var(--c-line);
		border-radius: var(--r-md);
		padding: var(--s-4);
		background: var(--c-surface);
	}
	.ex[data-bascule='tombe_malgre'] {
		border-left: 3px solid var(--c-line-strong);
	}
	.ex[data-bascule='sauve'] {
		border-left: 3px solid var(--c-vert);
	}
	.ex-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--s-3);
		margin-bottom: var(--s-3);
	}
	.ex-date {
		font-size: 14px;
		color: var(--c-ink-2);
	}
	.ex-tag {
		font-size: 12px;
		color: var(--c-ink-3);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.ex-tag[data-bascule='sauve'] {
		color: var(--c-vert);
	}
	.ex-lignes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.l {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
	}
	.l-mid {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.l-match {
		font-size: 15px;
		color: var(--c-ink);
	}
	.l-marche {
		font-size: 13px;
		color: var(--c-ink-2);
	}
	.l-note {
		font-size: 12px;
		color: var(--c-ink-3);
		margin-top: 1px;
	}
	.strike {
		text-decoration: line-through;
		color: var(--c-ink-3);
	}
	.l-cote {
		font-family: var(--font-mono);
		font-size: 15px;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.ex-cote {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: var(--s-3);
		padding-top: var(--s-3);
		border-top: 1px dashed var(--c-line);
	}
	.cc-label {
		font-size: 13px;
		color: var(--c-ink-2);
	}
	.cc-val {
		font-family: var(--font-mono);
		font-size: 18px;
		font-weight: 500;
		color: var(--c-ink);
		font-feature-settings: 'tnum' 1;
	}
	.ex-verdict {
		margin: var(--s-3) 0 0;
		font-size: 14px;
		color: var(--c-ink);
	}
</style>
