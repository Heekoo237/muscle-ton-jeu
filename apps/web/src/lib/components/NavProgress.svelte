<script lang="ts">
	// Indicateur de navigation : fine barre en haut, visible dès qu'une transition
	// serveur est en cours ($navigating). Sur Android 3G, deux secondes sans signal,
	// c'est un utilisateur qui reclique ou qui part — ici, il voit tout de suite que
	// « ça charge ». Animation légère (un seul transform, GPU) ; réduite si l'OS le
	// demande. Aucune donnée, aucun coût réseau.
	import { navigating } from '$app/stores';
</script>

{#if $navigating}
	<div class="navprogress" role="status" aria-label="Chargement de la page">
		<div class="bar"></div>
	</div>
{/if}

<style>
	.navprogress {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 100;
		overflow: hidden;
		background: var(--c-line, rgba(0, 0, 0, 0.08));
	}
	.bar {
		height: 100%;
		width: 40%;
		background: var(--c-accent, #c93a1a);
		border-radius: 0 3px 3px 0;
		animation: slide 1.1s ease-in-out infinite;
		will-change: transform;
	}
	@keyframes slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(320%);
		}
	}
	/* Mouvement coûteux évité si l'OS le demande : barre pleine qui pulse doucement. */
	@media (prefers-reduced-motion: reduce) {
		.bar {
			width: 100%;
			animation: pulse 1.2s ease-in-out infinite;
		}
		@keyframes pulse {
			0%,
			100% {
				opacity: 0.5;
			}
			50% {
				opacity: 1;
			}
		}
	}
</style>
