/**
 * support.ts — Lien vers le support (PRD : WhatsApp support, dès le jour 1).
 *
 * Le numéro réel est fourni par `PUBLIC_SUPPORT_WHATSAPP` (chiffres, indicatif
 * compris). Tant qu'il n'est pas renseigné, on retombe sur la page d'aide, qui
 * centralise les contacts — jamais un lien mort. Le message pré-rempli aide
 * l'utilisateur à expliquer son problème sans effort.
 */
import { env } from '$env/dynamic/public';

export function supportLink(message?: string): string {
	const num = (env.PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
	if (!num) return '/aide';
	const texte = message ? `?text=${encodeURIComponent(message)}` : '';
	return `https://wa.me/${num}${texte}`;
}
