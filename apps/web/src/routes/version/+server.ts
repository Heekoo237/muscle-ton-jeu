import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * /version — QUEL COMMIT l'application déployée exécute-t-elle ?
 *
 * La leçon (CLAUDE.md) : un diagnostic sur du code inconnu ne vaut rien. Vercel
 * expose le commit du déploiement via `VERCEL_GIT_COMMIT_SHA` ; on le renvoie ici
 * pour VÉRIFIER, d'un coup d'œil dans le navigateur, que l'app tourne bien le code
 * à jour — au lieu de le supposer. Un hash de commit n'est pas un secret.
 */
export const GET: RequestHandler = () => {
	const sha = env.VERCEL_GIT_COMMIT_SHA ?? '';
	return json({
		commit: sha || 'dev',
		commitCourt: sha ? sha.slice(0, 8) : 'dev',
		branche: env.VERCEL_GIT_COMMIT_REF ?? '',
		message: env.VERCEL_GIT_COMMIT_MESSAGE ?? '',
		deploiement: env.VERCEL_DEPLOYMENT_ID ?? ''
	});
};
