<script lang="ts">
	// Bannière MODE TEST — impossible à rater (point 8). Fond contrasté, pas une
	// mention discrète. Affichée sur recharge, récapitulatif et succès.
</script>

<div class="test-banner" role="alert">
	<span class="dot" aria-hidden="true"></span>
	<span class="txt">Mode test — aucun paiement réel</span>
</div>

<style>
	.test-banner {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		background: #8e241c; /* rouge profond, jamais confondu avec le produit */
		color: #fff;
		border-radius: var(--r-md);
		padding: var(--s-3) var(--s-4);
		font-weight: 700;
		letter-spacing: 0.2px;
		box-shadow: 0 2px 0 rgba(0, 0, 0, 0.15);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #fff;
		flex: none;
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.35; }
	}
	@media (prefers-reduced-motion: reduce) {
		.dot { animation: none; }
	}
</style>
