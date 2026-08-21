import { defineConfig } from '@playwright/test';

/**
 * E2E du CHEMIN D'UPLOAD — ce que TOUS les utilisateurs touchent en premier.
 * S'il casse, plus personne n'entre. On teste le moteur de réessai côté client
 * (succès, réessai, double échec) et le garde HEIC, en MOCKANT la réponse de
 * l'action serveur (page.route) : déterministe, sans vision réelle ni base.
 *
 * Le binaire Chromium est pré-installé dans l'environnement ; on le pointe
 * explicitement (la version de @playwright/test peut différer du revision présent).
 */
export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:5173',
		launchOptions: { executablePath: '/opt/pw-browsers/chromium' }
	},
	webServer: {
		command: 'pnpm exec vite dev --port 5173 --strictPort',
		port: 5173,
		reuseExistingServer: true,
		timeout: 120_000
	}
});
