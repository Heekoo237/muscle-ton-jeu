<script lang="ts">
	// Landing — reconstruction fidèle de la maquette Claude Design (Landing.dc.html).
	// Page autonome : bandeau défilant en haut, son propre pied de page en bas
	// (donc hors du groupe (public) qui ajoute nav + footer).
	const ANTON = "'Anton', Impact, sans-serif";
	const MONO = "'JetBrains Mono', ui-monospace, monospace";

	const leagues = [
		'Premier League', 'Ligue 1', 'La Liga', 'Serie A', 'Bundesliga',
		'Champions League', 'Europa League', 'Liga Portugal', 'Eredivisie',
		'Jupiler Pro League', 'Saudi Pro League', 'Süper Lig', 'Premier Liga'
	];

	type L = { m: string; s: string; fragile?: boolean; removed?: boolean };
	const heroLines: L[] = [
		{ m: 'ARSENAL – LIVERPOOL', s: 'Arsenal ou match nul' },
		{ m: 'MARSEILLE – LYON', s: 'Plus de 2,5 buts', fragile: true },
		{ m: 'NAPOLI – ROMA', s: 'Napoli gagne', fragile: true },
		{ m: 'BAYERN – DORTMUND', s: 'Les deux marquent' },
		{ m: 'REAL – SEVILLA', s: 'Real gagne' },
		{ m: 'PSG – NICE', s: 'Plus de 1,5 but' }
	];
	const moduleLines: L[] = [
		{ m: 'ARSENAL – LIVERPOOL', s: 'Arsenal ou match nul' },
		{ m: 'MARSEILLE – LYON', s: 'Plus de 2,5 buts', fragile: true, removed: true },
		{ m: 'NAPOLI – ROMA', s: 'Napoli gagne', fragile: true, removed: true },
		{ m: 'BAYERN – DORTMUND', s: 'Les deux marquent' },
		{ m: 'REAL – SEVILLA', s: 'Real gagne' },
		{ m: 'PSG – NICE', s: 'Plus de 1,5 but' },
		{ m: 'CHELSEA – EVERTON', s: 'Chelsea ou nul' },
		{ m: 'INTER – LAZIO', s: 'Moins de 3,5 buts', fragile: true, removed: true },
		{ m: 'AJAX – PSV', s: 'Les deux marquent' }
	];
	const faqLeft = [
		['C’est un site de paris ?', 'Non. On n’accepte aucune mise et on ne verse rien.'],
		['Vous garantissez que je vais gagner ?', 'Non, jamais. On donne une probabilité, pas une promesse.'],
		['Pourquoi vous montrez vos analyses ratées ?', 'Parce qu’un historique trié ne vaut rien.']
	];
	const faqRight = [
		['Comment je paie ?', 'Mobile Money, à partir de 500 F.'],
		['D’où viennent les données ?', 'De résultats de matchs, saison après saison.']
	];
</script>

<svelte:head>
	<title>Muscle Ton Jeu</title>
	<meta name="description" content="Envoie la capture de ton ticket. On te montre le match qui va le faire tomber, et ta version renforcée." />
</svelte:head>

<!-- Ligne de ticket papier (desktop + hero) : marché en français, ▲ ocre si fragile, barré si retiré -->
{#snippet lineD(x: L)}
	<div style="display:flex;flex-direction:column;gap:2px">
		<div style="font-size:14px;line-height:1.35;letter-spacing:0.6px;color:{x.removed ? '#6E6357' : '#24201B'};{x.removed ? 'text-decoration:line-through;' : ''}overflow-wrap:anywhere">{x.m}{#if x.fragile && !x.removed}&nbsp;<span style="color:#8C6309">▲</span>{/if}</div>
		<div style="font-size:14px;line-height:1.35;color:#6E6357;padding-left:14px;{x.removed ? 'text-decoration:line-through;' : ''}overflow-wrap:anywhere">{x.s}</div>
	</div>
{/snippet}

<!-- Ligne de ticket papier (module mobile) : hauteur réservée pour aligner les deux totaux -->
{#snippet lineM(x: L)}
	<div style="display:flex;flex-direction:column;gap:2px">
		<div style="font-size:14px;line-height:1.3;letter-spacing:0.3px;color:{x.removed ? '#6E6357' : '#24201B'};{x.removed ? 'text-decoration:line-through;' : ''}overflow-wrap:anywhere;min-height:38px">{x.m}{#if x.fragile && !x.removed}&nbsp;<span style="color:#8C6309">▲</span>{/if}</div>
		<div style="font-size:14px;line-height:1.3;color:#6E6357;{x.removed ? 'text-decoration:line-through;' : ''}overflow-wrap:anywhere">{x.s}</div>
	</div>
{/snippet}

<div style="background:#F8F1E4;font-family:var(--font-body);color:#24201B">

	<!-- ═══ 1 · BANDEAU DÉFILANT ═══ -->
	<div style="background:#24201B;overflow:hidden;padding:14px 0">
		<div class="marquee-track" style="display:flex;width:max-content">
			{#each [0, 1] as dup (dup)}
				<div aria-hidden={dup === 1} style="display:flex;gap:20px;padding-right:20px;font-family:{ANTON};font-size:24px;line-height:1.05;letter-spacing:-0.5px;color:#F8F1E4;text-transform:uppercase;white-space:nowrap">
					{#each leagues as lg (lg)}
						<span>{lg}</span><span style="color:rgba(248,241,228,0.45)">/</span>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<!-- ═══ 2 · HERO ═══ -->
	<div style="background:linear-gradient(180deg,#FBEAE3 0%,#F8F1E4 100%);border-bottom:1px solid #E2D6C0;overflow:hidden">
		<div style="max-width:1120px;margin:0 auto;padding:clamp(40px,5vw,80px) clamp(16px,3.5vw,40px);box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:clamp(28px,4vw,64px)">
			<div style="flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:20px">
				<div style="font-family:{ANTON};font-size:18px;line-height:1;letter-spacing:-0.4px;text-transform:uppercase">Muscle Ton Jeu</div>
				<h1 style="margin:0;font-family:{ANTON};font-weight:400;font-size:clamp(44px,5.2vw,72px);line-height:1;letter-spacing:-1.2px;text-transform:uppercase;text-wrap:balance">Un match va faire<br />tomber ton ticket</h1>
				<div style="font-size:18px;line-height:1.45;color:#4A4238;max-width:34ch">Envoie la capture. On te montre lequel, et ta version renforcée.</div>
				<a href="/analyser" style="width:100%;max-width:360px;height:52px;background:#C93A1A;color:#F8F1E4;border-radius:999px;font-size:16px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Analyser mon ticket</a>
				<div style="font-size:16px;color:#4A4238">Envoie une capture. Réponse en 30 secondes.</div>
				<div style="font-size:14px;line-height:1.4;color:#6E6357">18+ · Outil d’aide à la décision, pas un pronostic garanti</div>
			</div>

			<div style="flex:1 1 380px;min-width:0;display:flex;flex-direction:column;gap:10px;align-items:flex-end">
				<span style="display:inline-flex;align-items:center;height:28px;padding:0 12px;background:#EFE5D3;border:1px solid #E2D6C0;border-radius:999px;font-size:14px;color:#6E6357;white-space:nowrap">exemple · démo</span>

				<!-- Ticket papier (desktop) -->
				<div class="mtj-desktop" style="width:100%;max-width:400px;margin-bottom:-160px;transform:rotate(1.4deg);filter:drop-shadow(0 3px 5px rgba(36,32,27,0.13))">
					<div style="height:10px;background-image:radial-gradient(circle at 50% 0,transparent 0 5px,#FDFAF3 5.5px);background-size:14px 10px;background-repeat:repeat-x"></div>
					<div style="background:#FDFAF3;padding:20px 26px 40px;font-family:{MONO};font-weight:500;display:flex;flex-direction:column;gap:16px">
						<div style="display:flex;flex-direction:column;gap:4px;text-align:center">
							<div style="font-family:{ANTON};font-size:20px;line-height:1.05;letter-spacing:0.5px;text-transform:uppercase;color:#24201B">Muscle Ton Jeu</div>
							<div style="font-size:14px;line-height:1.35;color:#6E6357">Samedi 14 · 20:45</div>
						</div>
						<div style="border-top:1px dashed #C9B79A"></div>
						<div style="display:flex;flex-direction:column;gap:14px">
							{#each heroLines as x (x.m)}{@render lineD(x)}{/each}
						</div>
					</div>
				</div>

				<!-- Ticket papier (mobile) -->
				<div class="mtj-mobile" style="width:100%;margin-bottom:-110px;transform:rotate(0.6deg);filter:drop-shadow(0 2px 4px rgba(36,32,27,0.13))">
					<div style="height:8px;background-image:radial-gradient(circle at 50% 0,transparent 0 4px,#FDFAF3 4.5px);background-size:12px 8px;background-repeat:repeat-x"></div>
					<div style="background:#FDFAF3;padding:16px 18px 40px;font-family:{MONO};font-weight:500;display:flex;flex-direction:column;gap:14px">
						<div style="display:flex;flex-direction:column;gap:4px;text-align:center">
							<div style="font-family:{ANTON};font-size:18px;line-height:1.05;letter-spacing:0.4px;text-transform:uppercase;color:#24201B">Muscle Ton Jeu</div>
							<div style="font-size:14px;line-height:1.35;color:#6E6357">Samedi 14 · 20:45</div>
						</div>
						<div style="border-top:1px dashed #C9B79A"></div>
						<div style="display:flex;flex-direction:column;gap:14px">
							{#each heroLines.slice(0, 4) as x (x.m)}{@render lineD(x)}{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- ═══ 3 · MODULE DE COMPARAISON ═══ -->
	<div style="background:#EFE5D3;border-bottom:1px solid #E2D6C0">
		<div style="max-width:1120px;margin:0 auto;padding:clamp(32px,4vw,64px) clamp(16px,3.5vw,40px) clamp(40px,5vw,80px);box-sizing:border-box;display:flex;flex-direction:column;gap:clamp(20px,2.5vw,32px)">
			<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
				<h2 style="margin:0;font-family:{ANTON};font-weight:400;font-size:clamp(24px,2.6vw,36px);line-height:1.05;letter-spacing:-0.5px;text-transform:uppercase">Ton ticket, lu</h2>
				<span style="flex:0 0 auto;display:inline-flex;align-items:center;height:28px;padding:0 12px;background:#F8F1E4;border:1px solid #E2D6C0;border-radius:999px;font-size:14px;color:#6E6357;white-space:nowrap">exemple · démo</span>
			</div>

			<!-- DESKTOP : deux tickets côte à côte -->
			<div class="mtj-desktop" style="display:flex;align-items:stretch;justify-content:center;gap:0;padding:8px 0">
				<div style="flex:0 1 420px;min-width:0;display:flex;flex-direction:column;gap:12px;transform:rotate(-0.8deg);filter:drop-shadow(0 3px 5px rgba(36,32,27,0.13))">
					<div style="text-align:center;font-size:14px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#6E6357">Ton ticket</div>
					<div style="display:flex;flex-direction:column">
						<div style="height:10px;background-image:radial-gradient(circle at 50% 0,transparent 0 5px,#FDFAF3 5.5px);background-size:14px 10px;background-repeat:repeat-x"></div>
						<div style="background:#FDFAF3;padding:20px 26px 24px;font-family:{MONO};font-weight:500;display:flex;flex-direction:column;gap:16px">
							<div style="display:flex;flex-direction:column;gap:4px;text-align:center">
								<div style="font-family:{ANTON};font-size:20px;line-height:1.05;letter-spacing:0.5px;text-transform:uppercase;color:#24201B">Muscle Ton Jeu</div>
								<div style="font-size:14px;line-height:1.35;color:#6E6357">Samedi 14 · 20:45</div>
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;flex-direction:column;gap:14px">
								{#each moduleLines as x (x.m)}{@render lineD({ m: x.m, s: x.s, fragile: x.fragile })}{/each}
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
								<span style="font-size:14px;letter-spacing:0.6px;color:#24201B">TES CHANCES</span>
								<span style="font-size:34px;line-height:1;color:#24201B;font-variant-numeric:tabular-nums">1,3&nbsp;%</span>
							</div>
						</div>
						<div style="height:10px;background-image:radial-gradient(circle at 50% 100%,transparent 0 5px,#FDFAF3 5.5px);background-size:14px 10px;background-repeat:repeat-x"></div>
					</div>
				</div>

				<div style="flex:0 0 auto;align-self:center;z-index:3;margin:0 -18px;width:48px;height:48px;border-radius:999px;background:#EFE5D3;border:1px solid #C9B79A;display:flex;align-items:center;justify-content:center;font-family:{MONO};font-weight:500;font-size:18px;color:#4A4238">→</div>

				<div style="flex:0 1 420px;min-width:0;display:flex;flex-direction:column;gap:12px;transform:rotate(0.8deg);filter:drop-shadow(0 3px 5px rgba(36,32,27,0.13))">
					<div style="text-align:center;font-size:14px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#6E6357">Ton ticket renforcé</div>
					<div style="display:flex;flex-direction:column">
						<div style="height:10px;background-image:radial-gradient(circle at 50% 0,transparent 0 5px,#FDFAF3 5.5px);background-size:14px 10px;background-repeat:repeat-x"></div>
						<div style="background:#FDFAF3;padding:20px 26px 24px;font-family:{MONO};font-weight:500;display:flex;flex-direction:column;gap:16px">
							<div style="display:flex;flex-direction:column;gap:4px;text-align:center">
								<div style="font-family:{ANTON};font-size:20px;line-height:1.05;letter-spacing:0.5px;text-transform:uppercase;color:#24201B">Muscle Ton Jeu</div>
								<div style="font-size:14px;line-height:1.35;color:#6E6357">Samedi 14 · 20:45</div>
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;flex-direction:column;gap:14px">
								{#each moduleLines as x (x.m)}{@render lineD({ m: x.m, s: x.s, removed: x.removed })}{/each}
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px">
								<span style="font-size:14px;letter-spacing:0.6px;color:#24201B">TES CHANCES</span>
								<span style="font-size:34px;line-height:1;color:#C93A1A;font-variant-numeric:tabular-nums">7,5&nbsp;%</span>
							</div>
						</div>
						<div style="height:10px;background-image:radial-gradient(circle at 50% 100%,transparent 0 5px,#FDFAF3 5.5px);background-size:14px 10px;background-repeat:repeat-x"></div>
					</div>
				</div>
			</div>

			<!-- MOBILE : deux tickets côte à côte, 5 lignes -->
			<div class="mtj-mobile" style="display:flex;align-items:flex-start;gap:8px">
				<div style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:8px;transform:rotate(-0.6deg);filter:drop-shadow(0 2px 4px rgba(36,32,27,0.13))">
					<div style="text-align:center;font-size:14px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6E6357">Ton ticket</div>
					<div style="display:flex;flex-direction:column">
						<div style="height:8px;background-image:radial-gradient(circle at 50% 0,transparent 0 4px,#FDFAF3 4.5px);background-size:12px 8px;background-repeat:repeat-x"></div>
						<div style="background:#FDFAF3;padding:12px 10px 14px;font-family:{MONO};font-weight:500;display:flex;flex-direction:column;gap:12px">
							<div style="display:flex;flex-direction:column;gap:2px;text-align:center">
								<div style="font-family:{ANTON};font-size:16px;line-height:1.05;letter-spacing:0.4px;text-transform:uppercase;color:#24201B">Muscle Ton Jeu</div>
								<div style="font-size:14px;line-height:1.3;color:#6E6357">Samedi 14</div>
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;flex-direction:column;gap:12px">
								{#each moduleLines.slice(0, 5) as x (x.m)}{@render lineM({ m: x.m, s: x.s, fragile: x.fragile })}{/each}
								<div style="font-size:14px;line-height:1.3;color:#6E6357">… et 4 autres</div>
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;flex-direction:column;gap:2px">
								<span style="font-size:14px;letter-spacing:0.3px;color:#24201B">TES CHANCES</span>
								<span style="font-size:26px;line-height:1;color:#24201B;font-variant-numeric:tabular-nums">1,3&nbsp;%</span>
							</div>
						</div>
						<div style="height:8px;background-image:radial-gradient(circle at 50% 100%,transparent 0 4px,#FDFAF3 4.5px);background-size:12px 8px;background-repeat:repeat-x"></div>
					</div>
				</div>

				<div style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:8px;transform:rotate(0.6deg);filter:drop-shadow(0 2px 4px rgba(36,32,27,0.13))">
					<div style="text-align:center;font-size:14px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:#6E6357">Renforcé</div>
					<div style="display:flex;flex-direction:column">
						<div style="height:8px;background-image:radial-gradient(circle at 50% 0,transparent 0 4px,#FDFAF3 4.5px);background-size:12px 8px;background-repeat:repeat-x"></div>
						<div style="background:#FDFAF3;padding:12px 10px 14px;font-family:{MONO};font-weight:500;display:flex;flex-direction:column;gap:12px">
							<div style="display:flex;flex-direction:column;gap:2px;text-align:center">
								<div style="font-family:{ANTON};font-size:16px;line-height:1.05;letter-spacing:0.4px;text-transform:uppercase;color:#24201B">Muscle Ton Jeu</div>
								<div style="font-size:14px;line-height:1.3;color:#6E6357">Samedi 14</div>
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;flex-direction:column;gap:12px">
								{#each moduleLines.slice(0, 5) as x (x.m)}{@render lineM({ m: x.m, s: x.s, removed: x.removed })}{/each}
								<div style="font-size:14px;line-height:1.3;color:#6E6357">… et 4 autres</div>
							</div>
							<div style="border-top:1px dashed #C9B79A"></div>
							<div style="display:flex;flex-direction:column;gap:2px">
								<span style="font-size:14px;letter-spacing:0.3px;color:#24201B">TES CHANCES</span>
								<span style="font-size:26px;line-height:1;color:#C93A1A;font-variant-numeric:tabular-nums">7,5&nbsp;%</span>
							</div>
						</div>
						<div style="height:8px;background-image:radial-gradient(circle at 50% 100%,transparent 0 4px,#FDFAF3 4.5px);background-size:12px 8px;background-repeat:repeat-x"></div>
					</div>
				</div>
			</div>

			<!-- Ligne de résultat -->
			<div style="background:#F8F1E4;border:1px solid #C9B79A;border-radius:14px;padding:clamp(16px,2vw,24px);display:flex;flex-direction:column;gap:8px">
				<div style="font-size:18px;line-height:1.45;color:#24201B">3 matchs retirés. Tes chances passent de <span style="font-weight:600;font-variant-numeric:tabular-nums">1,3&nbsp;%</span> à <span style="font-weight:600;font-variant-numeric:tabular-nums">7,5&nbsp;%</span>.</div>
				<div style="font-size:14px;line-height:1.4;color:#6E6357">18+ · Outil d’aide à la décision, pas un pronostic garanti. Une probabilité n’est pas une garantie.</div>
			</div>

			<a href="/analyser" style="width:100%;max-width:360px;height:52px;background:transparent;color:#24201B;border:1px solid #C9B79A;border-radius:999px;font-size:16px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Voir le détail</a>
		</div>
	</div>

	<!-- ═══ 4 · TROIS ÉTAPES ═══ -->
	<div style="background:#24201B">
		<div style="max-width:1120px;margin:0 auto;padding:clamp(40px,5vw,80px) clamp(16px,3.5vw,40px);box-sizing:border-box;display:flex;flex-wrap:wrap;gap:clamp(24px,3vw,48px)">
			{#each ['Envoie ta capture', 'On lit chaque match', 'Tu vois ce qui va tomber'] as etape (etape)}
				<div style="flex:1 1 260px;min-width:0;display:flex;align-items:baseline;gap:16px">
					<span style="flex:0 0 auto;font-family:{ANTON};font-size:clamp(40px,4vw,56px);line-height:0.9;color:rgba(248,241,228,0.32)">→</span>
					<span style="font-size:18px;font-weight:600;line-height:1.25;letter-spacing:-0.2px;color:#F8F1E4">{etape}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- ═══ 5 · HISTORIQUE PUBLIC ═══ -->
	<div style="background:#F8F1E4;border-bottom:1px solid #E2D6C0">
		<div style="max-width:1120px;margin:0 auto;padding:clamp(40px,5vw,80px) clamp(16px,3.5vw,40px);box-sizing:border-box;display:flex;flex-wrap:wrap;gap:clamp(24px,3vw,48px)">
			<div style="flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:16px">
				<h2 style="margin:0;font-family:{ANTON};font-weight:400;font-size:clamp(24px,2.6vw,36px);line-height:1.05;letter-spacing:-0.5px;text-transform:uppercase">Historique public</h2>
				<div style="font-size:16px;line-height:1.5;color:#4A4238;max-width:44ch">Chaque analyse est publiée avant le coup d’envoi. Les ratées restent en ligne.</div>
				<a href="/historique" style="display:inline-flex;align-items:center;height:48px;font-size:16px;font-weight:600">Voir l’historique</a>
			</div>
			<div style="flex:1 1 320px;min-width:0;align-self:center;background:#EFE5D3;border-radius:20px;padding:clamp(20px,2.2vw,32px);display:flex;flex-direction:column;gap:8px">
				<div style="font-size:18px;line-height:1.45;color:#24201B">Deux chiffres toujours affichés ensemble : le taux de réussite et le rendement.</div>
				<div style="font-size:16px;line-height:1.5;color:#4A4238">Un taux de réussite seul ne veut rien dire.</div>
			</div>
		</div>
	</div>

	<!-- ═══ 6 · CRÉDITS ═══ -->
	<div style="background:#EFE5D3;border-bottom:1px solid #E2D6C0">
		<div style="max-width:1120px;margin:0 auto;padding:clamp(40px,5vw,80px) clamp(16px,3.5vw,40px);box-sizing:border-box;display:flex;flex-direction:column;gap:clamp(20px,2.5vw,32px)">
			<h2 style="margin:0;font-family:{ANTON};font-weight:400;font-size:clamp(24px,2.6vw,36px);line-height:1.05;letter-spacing:-0.5px;text-transform:uppercase">Crédits</h2>

			<div style="display:flex;flex-wrap:wrap;gap:clamp(16px,2vw,24px)">
				<div style="flex:1 1 320px;min-width:0;background:#FFFFFF;border:1px solid #E2D6C0;border-top:3px solid #E2D6C0;border-radius:20px;overflow:hidden">
					<div style="min-height:44px;display:flex;align-items:center;padding:0 16px;background:#EFE5D3;border-bottom:1px solid #E2D6C0;font-size:14px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;box-sizing:border-box">Ce que coûte une analyse</div>
					{#each [['2 à 6 matchs', '1 crédit'], ['7 à 12 matchs', '2 crédits'], ['13 à 20 matchs', '3 crédits']] as row, i (row[0])}
						<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:0 16px;{i < 2 ? 'border-bottom:1px solid #E2D6C0;' : ''}box-sizing:border-box"><span style="font-size:16px;font-variant-numeric:tabular-nums">{row[0]}</span><span style="font-size:16px;font-weight:600;font-variant-numeric:tabular-nums">{row[1]}</span></div>
					{/each}
				</div>

				<div style="flex:1 1 320px;min-width:0;background:#FFFFFF;border:1px solid #E2D6C0;border-top:3px solid #E2D6C0;border-radius:20px;overflow:hidden">
					<div style="min-height:44px;display:flex;align-items:center;padding:0 16px;background:#EFE5D3;border-bottom:1px solid #E2D6C0;font-size:14px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;box-sizing:border-box">Packs</div>
					{#each [['500 F', '5 crédits'], ['2 000 F', '25 crédits'], ['5 000 F', 'illimité 72 h']] as row, i (row[0])}
						<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:0 16px;{i < 2 ? 'border-bottom:1px solid #E2D6C0;' : ''}box-sizing:border-box"><span style="font-size:16px;font-weight:600;font-variant-numeric:tabular-nums">{row[0]}</span><span style="font-size:16px;color:#4A4238;font-variant-numeric:tabular-nums">{row[1]}</span></div>
					{/each}
				</div>
			</div>

			<div style="display:flex;flex-wrap:wrap;gap:8px">
				{#each ['Mobile Money', 'Pas d’abonnement', 'Ton premier ticket est offert'] as chip (chip)}
					<span style="display:inline-flex;align-items:center;height:28px;padding:0 12px;background:#F8F1E4;border:1px solid #E2D6C0;border-radius:999px;font-size:14px;color:#4A4238">{chip}</span>
				{/each}
			</div>

			<a href="/analyser" style="width:100%;max-width:360px;height:52px;background:#C93A1A;color:#F8F1E4;border-radius:999px;font-size:16px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Analyser mon ticket</a>
		</div>
	</div>

	<!-- ═══ 7 · FAQ + PIED DE PAGE ═══ -->
	<div style="background:#24201B">
		<div style="max-width:1120px;margin:0 auto;padding:clamp(40px,5vw,80px) clamp(16px,3.5vw,40px);box-sizing:border-box;display:flex;flex-direction:column;gap:clamp(20px,2.5vw,32px)">
			<h2 style="margin:0;font-family:{ANTON};font-weight:400;font-size:clamp(24px,2.6vw,36px);line-height:1.05;letter-spacing:-0.5px;text-transform:uppercase;color:#F8F1E4">Questions</h2>

			<div style="display:flex;flex-wrap:wrap;gap:clamp(24px,3vw,48px)">
				{#each [faqLeft, faqRight] as col, ci (ci)}
					<div style="flex:1 1 320px;min-width:0;display:flex;flex-direction:column">
						{#each col as qa (qa[0])}
							<div style="padding:20px 0;border-top:1px solid rgba(248,241,228,0.18);display:flex;flex-direction:column;gap:6px">
								<div style="font-size:18px;font-weight:600;letter-spacing:-0.2px;color:#F8F1E4">{qa[0]}</div>
								<div style="font-size:16px;line-height:1.5;color:rgba(248,241,228,0.72)">{qa[1]}</div>
							</div>
						{/each}
					</div>
				{/each}
			</div>

			<div style="height:1px;background:rgba(248,241,228,0.18)"></div>

			<div style="display:flex;flex-wrap:wrap;gap:clamp(20px,3vw,48px);align-items:flex-start">
				<div style="flex:1 1 240px;min-width:0;display:flex;flex-direction:column;gap:16px">
					<div style="font-family:{ANTON};font-size:24px;line-height:1;letter-spacing:-0.5px;color:#F8F1E4;text-transform:uppercase">Muscle Ton Jeu</div>
					<div style="display:flex;align-items:center;gap:12px">
						<span style="display:inline-flex;align-items:center;height:28px;padding:0 12px;border:1px solid rgba(248,241,228,0.35);border-radius:999px;font-size:14px;font-weight:600;letter-spacing:0.6px;color:#F8F1E4">18+</span>
						<span style="font-size:14px;color:rgba(248,241,228,0.72)">Outil d’aide à la décision</span>
					</div>
					<div style="font-size:14px;line-height:1.4;color:rgba(248,241,228,0.72);max-width:40ch">Muscle Ton Jeu n’accepte aucune mise et ne verse aucun gain.</div>
				</div>
				<div style="flex:1 1 240px;min-width:0;display:flex;flex-direction:column">
					<a href="/jeu-responsable" style="display:inline-flex;align-items:center;height:48px;font-size:16px;font-weight:600;color:#F8F1E4;text-decoration-color:rgba(248,241,228,0.4)">Jeu responsable</a>
					<a href="/legal" style="display:inline-flex;align-items:center;height:48px;font-size:16px;font-weight:600;color:#F8F1E4;text-decoration-color:rgba(248,241,228,0.4)">Mentions légales</a>
					<a href="/legal" style="display:inline-flex;align-items:center;height:48px;font-size:16px;font-weight:600;color:#F8F1E4;text-decoration-color:rgba(248,241,228,0.4)">CGU</a>
					<a href="/legal" style="display:inline-flex;align-items:center;height:48px;font-size:16px;font-weight:600;color:#F8F1E4;text-decoration-color:rgba(248,241,228,0.4)">Confidentialité</a>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes mtj-marquee {
		from {
			transform: translate3d(0, 0, 0);
		}
		to {
			transform: translate3d(-50%, 0, 0);
		}
	}
	.marquee-track {
		animation: mtj-marquee 42s linear infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.marquee-track {
			animation: none;
		}
	}
	/* Bascule desktop/mobile au point de rupture de la maquette (860 px) */
	@media (min-width: 860px) {
		:global(.mtj-mobile) {
			display: none !important;
		}
	}
	@media (max-width: 859px) {
		:global(.mtj-desktop) {
			display: none !important;
		}
	}
</style>
