import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/public';
import { supportLink } from '$lib/support';

/**
 * Politique de confidentialité (I2). URL STABLE `/confidentialite` — c'est celle
 * donnée à Google pour la validation OAuth ; ne pas la changer.
 *
 * Contact : WhatsApp via `PUBLIC_SUPPORT_WHATSAPP` (lien jamais mort — retombe sur
 * /aide si absent) ; e-mail via `PUBLIC_SUPPORT_EMAIL` si renseigné.
 */
export const load: PageServerLoad = () => {
	return {
		supportUrl: supportLink('Bonjour, une question sur mes données personnelles.'),
		email: env.PUBLIC_SUPPORT_EMAIL || null,
		// À incrémenter à chaque modification de fond du texte.
		majLe: '18 août 2026'
	};
};
