<script lang="ts">
	// Mention légale (DESIGN.md §7.11) — suit tout bloc de probabilité, jamais
	// repliée, jamais sous 14 px, jamais en --c-ink-mute.
	let {
		variant = 'proba'
	}: { variant?: 'proba' | 'hero' } = $props();

	const HERO = 'Outil d’analyse et d’aide à la décision — pas un pronostic garanti · 18+';
	const PROBA = 'Rien n’est jamais garanti au foot. Joue de façon responsable · 18+';
</script>

<p class="legal-note t-small measure">{variant === 'hero' ? HERO : PROBA}</p>

<style>
	.legal-note {
		color: var(--c-ink-3);
		margin: var(--s-3) 0 0;
	}
</style>
