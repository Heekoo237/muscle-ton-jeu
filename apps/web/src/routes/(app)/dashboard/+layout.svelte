<script lang="ts">
	// Chrome du dashboard. Desktop : barre latérale fixe 240px. Mobile 360 : barre
	// de navigation basse fixe (4 cibles), + fin bandeau d'identité en haut.
	// Tokens DESIGN.md, cibles 48px, aucune ombre. Un seul accent visible (le
	// bouton d'action du contenu) : le wordmark est en encre, pas en accent.
	import { page } from '$app/stores';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const ANTON = "'Anton', Impact, sans-serif";
	const initiale = $derived((data.prenom ?? '?').trim().charAt(0).toUpperCase() || '?');

	let imgOk = $state(true);
	let notifOpen = $state(false);
	let seen = $state(false);
	const hasUnread = $derived(data.notifications.length > 0 && !seen);
	function toggleNotif() {
		notifOpen = !notifOpen;
		if (notifOpen) seen = true;
	}

	function active(href: string): boolean {
		const p = $page.url.pathname;
		return href === '/dashboard' ? p === '/dashboard' : p.startsWith(href);
	}

	const NAV = [
		{ href: '/dashboard', label: 'Accueil', short: 'Accueil', icon: 'home' },
		{ href: '/dashboard/historique', label: 'Mon historique', short: 'Historique', icon: 'list' },
		{ href: '/historique', label: 'Historique public', short: 'Public', icon: 'globe' }
	];
</script>

{#snippet icon(name: string)}
	{#if name === 'home'}
		<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /></svg>
	{:else if name === 'list'}
		<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
	{:else if name === 'globe'}
		<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16" /></svg>
	{:else if name === 'logout'}
		<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h9" /></svg>
	{/if}
{/snippet}

{#snippet bell()}
	<div class="bellwrap">
		<button class="bell" type="button" onclick={toggleNotif} aria-label="Notifications" aria-expanded={notifOpen}>
			<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.5 20a2 2 0 01-3 0" /></svg>
			{#if hasUnread}<span class="dot" aria-hidden="true"></span>{/if}
		</button>
		{#if notifOpen}
			<div class="notifpanel" role="dialog" aria-label="Notifications">
				{#if data.notifications.length === 0}
					<p class="t-small vide">Aucune notification.</p>
				{:else}
					<ul>
						{#each data.notifications as n (n)}
							<li class="t-body">{n}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet avatar()}
	{#if data.avatarUrl && imgOk}
		<img class="ava" src={data.avatarUrl} alt="" referrerpolicy="no-referrer" onerror={() => (imgOk = false)} />
	{:else}
		<span class="ava fallback" aria-hidden="true">{initiale}</span>
	{/if}
{/snippet}

<div class="shell">
	<!-- SIDEBAR (desktop) -->
	<aside class="sidebar">
		<a class="logo" href="/dashboard" style="font-family:{ANTON}" aria-label="Muscle Ton Jeu — accueil">
			Muscle<br />Ton Jeu
		</a>

		<nav class="nav">
			{#each NAV as item (item.href)}
				<a class="navlink" href={item.href} class:active={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}>
					{@render icon(item.icon)}
					<span>{item.label}</span>
				</a>
			{/each}
			{@render bell()}
		</nav>

		<div class="me">
			<div class="who">
				{@render avatar()}
				<span class="prenom">{data.prenom}</span>
			</div>
			<form method="POST" action="/deconnexion">
				<button class="logout" type="submit">
					{@render icon('logout')}
					<span>Se déconnecter</span>
				</button>
			</form>
		</div>
	</aside>

	<!-- BANDEAU IDENTITÉ (mobile) -->
	<header class="mtop">
		<div class="who">
			{@render avatar()}
			<span class="prenom">{data.prenom}</span>
		</div>
		{@render bell()}
	</header>

	<!-- CONTENU -->
	<main class="content">
		{@render children()}
	</main>

	<!-- NAVIGATION BASSE (mobile) -->
	<nav class="bottomnav" aria-label="Navigation">
		{#each NAV as item (item.href)}
			<a class="tab" href={item.href} class:active={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}>
				{@render icon(item.icon)}
				<span>{item.short}</span>
			</a>
		{/each}
		<form method="POST" action="/deconnexion" class="tabform">
			<button class="tab" type="submit">
				{@render icon('logout')}
				<span>Quitter</span>
			</button>
		</form>
	</nav>
</div>

<style>
	.shell {
		min-height: 100dvh;
		background: var(--c-canvas);
	}

	/* ---- Barre latérale (desktop) ---- */
	.sidebar {
		display: none;
	}

	/* ---- Bandeau identité (mobile) ---- */
	.mtop {
		position: sticky;
		top: 0;
		z-index: 20;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--s-4);
		background: var(--c-canvas-sunk);
		border-bottom: 1px solid var(--c-line);
	}
	.who {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		min-width: 0;
	}
	.ava {
		width: 32px;
		height: 32px;
		border-radius: var(--r-pill);
		object-fit: cover;
		flex: 0 0 auto;
	}
	.ava.fallback {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--c-ink);
		color: var(--c-ink-inverse);
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 15px;
	}
	.prenom {
		font-weight: 600;
		color: var(--c-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ---- Contenu ---- */
	.content {
		padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
	}

	/* ---- Navigation basse (mobile) ---- */
	.bottomnav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		height: calc(56px + env(safe-area-inset-bottom, 0px));
		padding-bottom: env(safe-area-inset-bottom, 0px);
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		background: var(--c-canvas-sunk);
		border-top: 1px solid var(--c-line);
	}
	.tabform {
		display: flex;
	}
	.tab {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 48px;
		background: transparent;
		border: none;
		color: var(--c-ink-3);
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		transition: transform 100ms ease-out;
	}
	.tab span {
		white-space: nowrap;
	}
	.tab.active {
		color: var(--c-ink);
	}
	.tab:active {
		transform: scale(0.96);
	}

	/* ---- Cloche + panneau ---- */
	.bellwrap {
		position: relative;
	}
	.bell {
		position: relative;
		width: 48px;
		height: 48px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--r-pill);
		background: transparent;
		border: none;
		color: var(--c-ink);
		cursor: pointer;
	}
	.dot {
		position: absolute;
		top: 9px;
		right: 10px;
		width: 9px;
		height: 9px;
		border-radius: var(--r-pill);
		background: var(--c-accent);
		border: 2px solid var(--c-canvas-sunk);
	}
	.notifpanel {
		position: absolute;
		z-index: 40;
		top: 52px;
		right: 0;
		width: min(88vw, 320px);
		background: var(--c-surface);
		border: 1px solid var(--c-line-strong);
		border-radius: var(--r-lg);
		padding: var(--s-3);
	}
	.notifpanel ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.notifpanel li {
		padding: var(--s-3) var(--s-2);
		color: var(--c-ink);
	}
	.notifpanel li + li {
		border-top: 1px solid var(--c-line);
	}
	.notifpanel .vide {
		color: var(--c-ink-3);
		margin: 0;
		padding: var(--s-2);
	}

	/* ==================== DESKTOP ==================== */
	@media (min-width: 768px) {
		.shell {
			padding-left: 240px;
		}
		.mtop,
		.bottomnav {
			display: none;
		}
		.content {
			padding-bottom: var(--s-16);
		}
		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			width: 240px;
			z-index: 20;
			display: flex;
			flex-direction: column;
			gap: var(--s-6);
			padding: var(--s-6) var(--s-4);
			background: var(--c-canvas-sunk);
			border-right: 1px solid var(--c-line);
			box-sizing: border-box;
		}
		.logo {
			font-size: 26px;
			line-height: 0.95;
			letter-spacing: -0.5px;
			text-transform: uppercase;
			color: var(--c-ink);
			text-decoration: none;
		}
		.nav {
			display: flex;
			flex-direction: column;
			gap: var(--s-1);
			flex: 1;
		}
		.navlink {
			display: flex;
			align-items: center;
			gap: var(--s-3);
			min-height: 48px;
			padding: 0 var(--s-3);
			border-radius: var(--r-pill);
			color: var(--c-ink-2);
			font-weight: 600;
			text-decoration: none;
		}
		.navlink.active {
			background: var(--c-surface);
			color: var(--c-ink);
			border: 1px solid var(--c-line);
		}
		.bellwrap {
			margin-top: var(--s-2);
		}
		.bell {
			width: 100%;
			justify-content: flex-start;
			gap: var(--s-3);
			padding: 0 var(--s-3);
			color: var(--c-ink-2);
		}
		.bell::after {
			content: 'Notifications';
			font-weight: 600;
			font-size: 16px;
		}
		.dot {
			left: 30px;
			right: auto;
			top: 8px;
			border-color: var(--c-canvas-sunk);
		}
		.notifpanel {
			top: auto;
			bottom: 52px;
			left: 0;
			right: auto;
		}
		.me {
			display: flex;
			flex-direction: column;
			gap: var(--s-3);
			padding-top: var(--s-4);
			border-top: 1px solid var(--c-line);
		}
		.logout {
			display: flex;
			align-items: center;
			gap: var(--s-3);
			width: 100%;
			min-height: 48px;
			padding: 0 var(--s-3);
			background: transparent;
			border: none;
			border-radius: var(--r-pill);
			color: var(--c-ink-2);
			font-family: var(--font-body);
			font-weight: 600;
			font-size: 16px;
			cursor: pointer;
		}
		.logout:hover {
			color: var(--c-ink);
		}
	}
</style>
