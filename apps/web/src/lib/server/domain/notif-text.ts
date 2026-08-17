/**
 * notif-text.ts — Textes de notification, DÉTERMINISTES, écrits en code. AUCUN LLM.
 *
 * Règles non négociables (comme le rédacteur) :
 *  - tutoiement, phrases courtes, ton du terrain ;
 *  - AUCUNE promesse de gain, AUCUNE incitation à rejouer ;
 *  - aucun vocabulaire interdit (garanti, sûr, gagnant…) ;
 *  - aucun nombre inventé : on ne cite que le nom du match, jamais une cote ou un gain.
 *
 * Ces fonctions sont PURES (pas d'état, pas de réseau) : testables telles quelles.
 * Le déclencheur (règlement) fournit le verdict déjà calculé par settle.ts.
 */
import type { NotificationPayload } from '$lib/server/services/notifications';
import type { TicketResult } from '$lib/types';

/** Verdict d'un ticket réglé, réduit à ce dont le texte a besoin (déjà calculé). */
export interface SettleVerdictText {
	/** Ticket ORIGINAL (toutes les sélections réglables). */
	originale: TicketResult;
	/** Ticket RENFORCÉ (les sélections gardées). */
	renforce: TicketResult;
	/** Libellé du match de la 1re sélection tombée (« Rio Ave – Porto »), ou null. */
	premierPerduMatchLabel: string | null;
	/** La 1re sélection tombée portait-elle le badge « fragile » ? */
	premierPerduFragile: boolean;
	/** A-t-on retiré au moins une sélection (ticket renforcé ≠ original) ? */
	aRetire: boolean;
}

/**
 * Notification de SUIVI DE RÉSULTAT. Sujet = le ticket de l'utilisateur (l'original) ;
 * le renforcé sert de contrefactuel honnête. Renvoie null si le ticket n'est pas
 * encore réglé (« en_attente ») — on ne notifie jamais un résultat incomplet.
 *
 * Quatre cas, tous FACTUELS (jamais « tu aurais gagné », jamais une incitation) :
 *  - passé                          → « Ton ticket est passé. Bien joué. »
 *  - tombé, mais le renforcé passe  → « … Le renforcé serait passé. »
 *  - tombé sur une ligne fragile    → « … C'était la sélection qu'on avait marquée fragile. »
 *  - tombé sur une ligne gardée     → « Ton ticket est tombé sur X. » (rien de plus, on n'invente pas)
 */
export function buildSettleNotification(
	v: SettleVerdictText,
	url?: string
): NotificationPayload | null {
	if (v.originale === 'en_attente') return null;

	if (v.originale === 'passe') {
		return { titre: 'Ton ticket est passé', corps: 'Ton ticket est passé. Bien joué.', url };
	}

	// À partir d'ici : le ticket original est tombé.
	const surMatch = v.premierPerduMatchLabel ? ` sur ${v.premierPerduMatchLabel}` : '';

	// Le renforcé aurait tenu (les lignes perdues étaient parmi les retirées).
	if (v.aRetire && v.renforce === 'passe') {
		return {
			titre: 'Ton ticket est tombé',
			corps: `Ton ticket est tombé${surMatch}. Le renforcé serait passé.`,
			url
		};
	}

	// Tombé sur une ligne qu'on avait marquée fragile (le « on t'avait prévenu »).
	if (v.premierPerduFragile) {
		return {
			titre: 'Ton ticket est tombé',
			corps: `Ton ticket est tombé${surMatch}. C'était la sélection qu'on avait marquée fragile.`,
			url
		};
	}

	// Tombé sur une ligne gardée, non fragile : on le dit simplement, sans rien inventer.
	return { titre: 'Ton ticket est tombé', corps: `Ton ticket est tombé${surMatch}.`, url };
}

/**
 * Notification RENDEZ-VOUS DU MATIN. Deux variantes, AUCUNE promesse fausse :
 *  - `premiereOffreDisponible` (premier ticket non utilisé) → on peut nommer la
 *    gratuité, elle est réelle pour cet utilisateur ;
 *  - sinon → message utile sans promesse de gratuité (l'analyse d'un ticket peut
 *    coûter des crédits selon le ticket, on ne le laisse pas croire gratuit).
 * L'appelant décide de l'éligibilité (matchs à venir, utilisateur actif) ; ici on rédige.
 */
export function buildMorningNotification(
	premiereOffreDisponible: boolean,
	url?: string
): NotificationPayload {
	const corps = premiereOffreDisponible
		? "Il te reste des analyses offertes. Les matchs du jour t'attendent."
		: 'Les matchs du jour sont analysés. Vérifie ton ticket avant de le valider.';
	return { titre: 'Muscle Ton Jeu', corps, url };
}
