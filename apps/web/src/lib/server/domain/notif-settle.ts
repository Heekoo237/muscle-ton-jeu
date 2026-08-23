/**
 * notif-settle.ts — Cœur du SUIVI DE RÉSULTAT : règle les tickets terminés et
 * décide l'envoi. Écrit contre des PORTS injectés (pas d'accès direct à la base
 * ici) pour que l'idempotence et les heures calmes soient testables sans réseau.
 *
 * Déclencheur : un ticket est réglé quand TOUS ses matchs analysés (réglables) sont
 * terminés — `settleTicket().originale` sort de « en_attente ». On pose alors le
 * résultat (celui du RENFORCÉ, la proposition du produit) et on notifie UNE fois.
 *
 * Garde-fous portés ici :
 *  - IDEMPOTENCE : l'envoi passe par `reserver` (réservation atomique de la clé
 *    « settle:<id> ») ; deux passages → un seul envoi (rule notifications n°1) ;
 *  - HEURES CALMES : en fenêtre calme on POSE le résultat mais on N'ENVOIE PAS ;
 *    la clé n'est pas réservée → le prochain passage hors fenêtre émet (rien perdu).
 */
import type { Selection, TicketResult } from '$lib/types';
import { settleTicket, type FinalScore } from './settle';
import { buildSettleNotification } from './notif-text';
import { enHeuresCalmes } from './notif-schedule';
import type { NotificationPayload } from '$lib/server/services/notifications';

export interface TicketARegler {
	id: number;
	userId: number;
	selections: Selection[];
}

export interface SettlePorts {
	/** Score final par fixtureId (null si le match n'est pas terminé). */
	scoresFor(fixtureIds: number[]): Promise<Map<number, FinalScore>>;
	/** Fixtures RETOURNÉS parmi ceux fournis (DC modèle vs 1X2 coté). Sert au garde :
	 *  une sélection SANS snapshot sur l'un d'eux n'est pas réglée (orientation incertaine). */
	flipSuspectsFor(fixtureIds: number[]): Promise<Set<number>>;
	/** Réservation atomique d'un envoi : true si CE passage l'a pris, false sinon. */
	reserver(cle: string, userId: number, type: 'settle' | 'matin'): Promise<boolean>;
	/** Envoi effectif à tous les appareils de l'utilisateur. */
	notify(userId: number, payload: NotificationPayload): Promise<void>;
	/**
	 * Pose le résultat du ticket (idempotent côté base : ne réécrit pas si déjà réglé).
	 * On persiste LES DEUX verdicts : `renforce` (la proposition du produit, historique)
	 * ET `originale` (le ticket tel que l'utilisateur l'avait joué). L'original était
	 * jusqu'ici calculé puis jeté — or c'est la preuve « ton ticket serait tombé, le
	 * renforcé serait passé », irrécupérable pour le passé une fois perdue.
	 */
	poserResultat(ticketId: number, renforce: TicketResult, originale: TicketResult): Promise<void>;
	/** Lien ouvert au tap (détail du ticket). */
	urlTicket(ticketId: number): string;
}

export interface SettleStats {
	regles: number; // tickets dont le résultat vient d'être posé
	notifies: number; // notifications réellement envoyées
	retenus: number; // prêts mais retenus par les heures calmes
	deja: number; // déjà notifiés (idempotence)
}

/** Champs de texte pour la notification, dérivés du verdict + des sélections. */
function verdictText(selections: Selection[], v: ReturnType<typeof settleTicket>) {
	const perdu = v.premierPerduOrdre != null
		? selections.find((s) => s.ordre === v.premierPerduOrdre)
		: undefined;
	return {
		originale: v.originale,
		renforce: v.renforce,
		premierPerduMatchLabel: perdu?.matchLabel ?? null,
		premierPerduFragile: perdu?.fragile ?? false,
		aRetire: selections.some((s) => s.retireeDuRenforce)
	};
}

/**
 * Règle une liste de tickets et notifie. `nowMs` injecté (déterminisme des tests).
 * Ne notifie QUE les tickets entièrement terminés, une seule fois, hors heures calmes.
 */
export async function runSettlement(
	tickets: TicketARegler[],
	ports: SettlePorts,
	nowMs: number
): Promise<SettleStats> {
	const stats: SettleStats = { regles: 0, notifies: 0, retenus: 0, deja: 0 };
	const calme = enHeuresCalmes(nowMs);

	for (const t of tickets) {
		const fixtureIds = [
			...new Set(t.selections.map((s) => s.fixtureId).filter((x): x is number => x !== null))
		];
		const scores = await ports.scoresFor(fixtureIds);
		const flip = await ports.flipSuspectsFor(fixtureIds);
		const verdict = settleTicket(t.selections, scores, flip);

		// GARDE orientation : une sélection sans snapshot sur un fixture retourné est
		// RETENUE (non réglée). On le JOURNALISE — c'est un ticket à regarder à la main,
		// jamais un faux verdict posé en silence. Marqueur stable pour la surveillance.
		if (verdict.retenues.length > 0) {
			console.warn(
				`[règlement] ORIENTATION INCERTAINE ticket ${t.id} — ${verdict.retenues.length} ` +
					`sélection(s) sans snapshot sur un fixture retourné : NON réglé, laissé en attente.`
			);
		}

		// Pas encore tous les matchs analysés terminés → on laisse en attente.
		if (verdict.originale === 'en_attente') continue;

		// Le résultat porté à l'historique est celui du RENFORCÉ (proposition du produit) ;
		// on persiste aussi l'ORIGINAL, pour mesurer plus tard la valeur réelle du retrait.
		await ports.poserResultat(t.id, verdict.renforce, verdict.originale);
		stats.regles++;

		// Heures calmes : résultat posé, mais AUCUN envoi. La clé n'est pas réservée,
		// le prochain passage hors fenêtre émettra (rien n'est perdu).
		if (calme) {
			stats.retenus++;
			continue;
		}

		// Idempotence : un seul envoi par ticket, même si le job tourne deux fois.
		const pris = await ports.reserver(`settle:${t.id}`, t.userId, 'settle');
		if (!pris) {
			stats.deja++;
			continue;
		}

		const payload = buildSettleNotification(verdictText(t.selections, verdict), ports.urlTicket(t.id));
		if (payload) {
			await ports.notify(t.userId, payload);
			stats.notifies++;
		}
	}
	return stats;
}
