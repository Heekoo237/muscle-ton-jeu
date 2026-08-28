<script lang="ts">
	// Aperçu du rendu — OUTIL, pas page marketing. Rend le VRAI composant de l'écran
	// résultat (ResultBody, le même qu'en production) avec des données FIGÉES, pour
	// vérifier le rendu après chaque changement sans monter un ticket. Quatre cas qui
	// comptent, un sélecteur pour passer de l'un à l'autre. Publique mais discrète :
	// noindex, jamais liée depuis le produit. Voir la checklist de pré-bêta.
	import ResultBody from '$lib/components/ResultBody.svelte';
	import type { LineVM, ResultVM } from '$lib/types';

	/** Ligne de démo : valeurs par défaut « solide analysée », surchargées au besoin. */
	function L(ordre: number, matchLabel: string, libelleFr: string, over: Partial<LineVM> = {}): LineVM {
		return {
			ordre,
			index: String(ordre).padStart(2, '0'),
			matchLabel,
			libelleFr,
			cote: null,
			fragile: false,
			retiree: false,
			mentionNeutre: false,
			serree: false,
			analysable: true,
			probabilitePct: 60,
			...over
		};
	}

	/** ResultVM de démo : valeurs neutres, surchargées par cas. */
	function VM(lignes: LineVM[], over: Partial<ResultVM>): ResultVM {
		const nbAnalysables = lignes.filter((l) => l.analysable).length;
		return {
			lignes,
			probaTotalePct: 0,
			probaRenforceePct: 0,
			nbRetirees: 0,
			multiplicateur: null,
			synthese: '',
			explications: [],
			serreExplications: [],
			rienARetirer: false,
			toutesFragiles: false,
			majoriteRetiree: false,
			conflitMemeMatch: false,
			nbAnalysables,
			nbSerrees: 0,
			aucunAnalysable: false,
			nbTotal: lignes.length,
			laPlusSerree: null,
			...over
		};
	}

	// ── Cas 1 : un ticket avec RETRAIT (mesuré + cote seule, pour les deux titres) ──
	const casRetrait = VM(
		[
			L(1, 'Newcastle – Liverpool', 'Newcastle gagne', { fragile: true, retiree: true, probabilitePct: 31 }),
			L(2, 'Randers – Silkeborg', 'Randers gagne', { fragile: true, retiree: true, probabilitePct: 34 }),
			L(3, 'Manchester City – Everton', 'Manchester City gagne', { probabilitePct: 78 }),
			L(4, 'Arsenal – Chelsea', 'Arsenal ou match nul', { probabilitePct: 66 })
		],
		{
			synthese: "Ton ticket de quatre matchs. Deux sont trop justes, on les a retirés.",
			probaTotalePct: 12.4,
			probaRenforceePct: 41.2,
			nbRetirees: 2,
			multiplicateur: '3 fois plus de chances',
			explications: [
				{
					ordre: 1,
					matchLabel: 'Newcastle – Liverpool',
					libelleFr: 'Newcastle gagne',
					avecBadge: true,
					texte: "Newcastle gagne moins d'une fois sur trois. On l'a retiré pour solidifier ton ticket.",
					chancesCotes: false,
					autresIssues: [
						{ libelleFr: 'Plus de 2,5 buts', probabilitePct: 61 },
						{ libelleFr: 'Liverpool gagne', probabilitePct: 55 }
					]
				},
				{
					ordre: 2,
					matchLabel: 'Randers – Silkeborg',
					libelleFr: 'Randers gagne',
					avecBadge: true,
					texte: "D'après les cotes, ce pari est trop juste. On l'a retiré.",
					chancesCotes: true,
					autresIssues: [
						{ libelleFr: 'Plus de 2,5 buts', probabilitePct: 58 },
						{ libelleFr: 'Silkeborg gagne', probabilitePct: 52 }
					]
				}
			]
		}
	);

	// ── Cas 2 : une ligne SERRÉE, rien retiré. On l'AVERTIT comme un retrait. ──
	const casSerre = VM(
		[
			L(1, 'Manchester City – Everton', 'Manchester City gagne', { probabilitePct: 78 }),
			L(2, 'Lyon – Fenerbahçe', 'Lyon gagne', { serree: true, probabilitePct: 54 }),
			L(3, 'Bayern – Fribourg', 'Bayern gagne', { probabilitePct: 72 }),
			L(4, 'Real – Getafe', 'Real ou match nul', { probabilitePct: 84 })
		],
		{
			synthese: 'Ton ticket de quatre matchs. Rien à retirer, mais un pari est risqué.',
			probaTotalePct: 24.1,
			probaRenforceePct: 24.1,
			rienARetirer: true,
			nbSerrees: 1,
			serreExplications: [
				{
					ordre: 2,
					matchLabel: 'Lyon – Fenerbahçe',
					libelleFr: 'Lyon gagne',
					probabilitePct: 54,
					faits: [
						'Lyon a gagné 2 de ses 5 derniers matchs.',
						'Fenerbahçe marque à l’extérieur presque à chaque match.'
					],
					autresIssues: [
						{ libelleFr: 'Plus de 2,5 buts', probabilitePct: 58 },
						{ libelleFr: 'Les deux équipes marquent', probabilitePct: 56 }
					],
					chancesCotes: false
				}
			]
		}
	);

	// ── Cas 3 : tout SOLIDE, rien à retirer ──
	const casSolide = VM(
		[
			L(1, 'Manchester City – Everton', 'Manchester City gagne', { probabilitePct: 79 }),
			L(2, 'Bayern – Fribourg', 'Bayern gagne', { probabilitePct: 74 }),
			L(3, 'Real – Getafe', 'Real ou match nul', { probabilitePct: 85 }),
			L(4, 'PSG – Metz', 'PSG gagne', { probabilitePct: 82 })
		],
		{
			synthese: 'Ton ticket de quatre matchs. Rien à retirer.',
			probaTotalePct: 41.0,
			probaRenforceePct: 41.0,
			rienARetirer: true,
			laPlusSerree: { matchLabel: 'Bayern – Fribourg', libelleFr: 'Bayern gagne', pct: 74 }
		}
	);

	// ── Cas 4 : RIEN d'analysable ──
	const casRien = VM(
		[
			L(1, 'Coton Sport – Union Douala', 'Coton Sport gagne', {
				analysable: false,
				probabilitePct: null,
				raisonNonAnalyse: 'hors_couverture'
			}),
			L(2, 'Marseille – Lyon', 'Buteur : Aubameyang', {
				analysable: false,
				probabilitePct: null,
				raisonNonAnalyse: 'non_couvert',
				familleNonCouverte: 'buteur'
			}),
			L(3, 'Fenerbahçe – Galatasaray', 'Fenerbahçe gagne', {
				analysable: false,
				probabilitePct: null,
				raisonNonAnalyse: 'non_cote'
			})
		],
		{
			synthese: 'Ton ticket de trois matchs. Aucun n’a pu être analysé.',
			aucunAnalysable: true
		}
	);

	const cas = [
		{ id: 'retrait', label: 'Avec retrait', vm: casRetrait },
		{ id: 'serre', label: 'Ligne serrée', vm: casSerre },
		{ id: 'solide', label: 'Tout solide', vm: casSolide },
		{ id: 'rien', label: 'Rien analysable', vm: casRien }
	] as const;

	let sel = $state(0);
</script>

<svelte:head>
	<title>Aperçu — Muscle Ton Jeu</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="apercu-bar">
	<span class="apercu-tag">Aperçu · données de démonstration</span>
	<div class="apercu-sel" role="tablist" aria-label="Cas d'affichage">
		{#each cas as c, i (c.id)}
			<button
				type="button"
				role="tab"
				aria-selected={sel === i}
				class:actif={sel === i}
				onclick={() => (sel = i)}>{c.label}</button
			>
		{/each}
	</div>
</div>

<main class="container">
	<h1 class="t-h1">Ton ticket, lu</h1>
	<ResultBody vm={cas[sel].vm} />
</main>

<style>
	.apercu-bar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--c-canvas-sunk);
		border-bottom: 1px solid var(--c-line);
		padding: var(--s-3) var(--s-4);
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	.apercu-tag {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--c-ink-3);
	}
	.apercu-sel {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.apercu-sel button {
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 600;
		padding: 6px 12px;
		border-radius: var(--r-pill);
		border: 1px solid var(--c-line-strong);
		background: var(--c-surface);
		color: var(--c-ink-2);
		cursor: pointer;
	}
	.apercu-sel button.actif {
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		border-color: var(--c-ink);
	}
	main {
		padding-top: var(--s-6);
		padding-bottom: var(--s-12);
		display: flex;
		flex-direction: column;
		gap: var(--s-5);
	}
</style>
