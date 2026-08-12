import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes mode partout sauf dans node_modules (libs).
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// SSR auto-hébergé (Node). La page publique et l'historique sont rendus serveur ;
			// règle d'archi n°8 : le serveur décide ce qu'il sérialise, jamais de contenu non payé côté client.
			adapter: adapter()
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
