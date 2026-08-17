/**
 * billing.ts — Règles de facturation (PRD §8, CLAUDE.md « Règles de facturation »).
 *
 * En cas de doute : ne jamais facturer un service non rendu. Le crédit se débite
 * à l'affichage réussi du résultat, jamais avant, et jamais pour un cas gratuit.
 */
import { creditCost } from './ticket';

export type GratuitReason =
	| 'premier_ticket'
	| 'tout_solide'
	| 'moins_de_3'
	| 'meme_ticket_24h';

export interface ChargeContext {
	nbAnalysables: number;
	premierTicket: boolean;
	rienARetirer: boolean;
	/**
	 * Rien retiré parce que TOUTES les sélections sont trop justes. Ce cas est
	 * FACTURÉ (contrairement à « tout solide ») : on a lu, résolu, calculé et dit
	 * quelque chose d'utile — « tout ton ticket est trop juste ». Un vrai service
	 * rendu, différent de « rien à retirer, ton ticket tient debout ».
	 */
	toutesFragiles?: boolean;
	/** Même ticket déjà analysé sous 24 h (via empreinte). */
	dejaAnalyseSous24h?: boolean;
}

export interface Charge {
	gratuit: boolean;
	raison?: GratuitReason;
	/** Crédits à débiter (0 si gratuit). null si le ticket est bloqué (> 20). */
	credits: number | null;
	/** Vrai au-delà de 20 sélections : blocage dur, non contournable. */
	bloque: boolean;
}

/**
 * Détermine le coût d'une analyse et les gratuités permanentes (PRD §8.4).
 * L'ordre des gratuités suit « éviter de facturer un service non rendu ».
 */
export function computeCharge(ctx: ChargeContext): Charge {
	const cost = creditCost(ctx.nbAnalysables);

	// Blocage dur au-delà de 20 (PRD §8.2), y compris avec des crédits.
	if (cost === null) return { gratuit: false, credits: null, bloque: true };

	// « Tout solide » = rien retiré ET ce n'est PAS « toutes fragiles ». Ce dernier a
	// de la valeur (on dit « tout ton ticket est trop juste ») → il est facturé, jamais
	// classé gratuit ici. Il tombe donc dans le régime normal (moins_de_3, puis coût).
	const toutSolide = ctx.rienARetirer && !ctx.toutesFragiles;

	// Gratuités permanentes.
	if (ctx.premierTicket) return { gratuit: true, raison: 'premier_ticket', credits: 0, bloque: false };
	if (toutSolide) return { gratuit: true, raison: 'tout_solide', credits: 0, bloque: false };
	if (ctx.nbAnalysables < 3) return { gratuit: true, raison: 'moins_de_3', credits: 0, bloque: false };
	if (ctx.dejaAnalyseSous24h)
		return { gratuit: true, raison: 'meme_ticket_24h', credits: 0, bloque: false };

	return { gratuit: false, credits: cost, bloque: false };
}

/** Packs de recharge (PRD §8.3). Le pack mis en avant couvre le ticket en cours. */
export interface Pack {
	id: 'ticket' | 'journee' | 'weekend';
	nom: string;
	prix: number; // francs CFA
	credits: number | 'illimite';
	mention: string;
}

export const PACKS: Pack[] = [
	{ id: 'ticket', nom: 'Ticket', prix: 500, credits: 5, mention: 'Les crédits n’expirent jamais' },
	{ id: 'journee', nom: 'Journée', prix: 2000, credits: 25, mention: 'Les crédits n’expirent jamais' },
	{ id: 'weekend', nom: 'Week-end', prix: 5000, credits: 'illimite', mention: 'Illimité 72 h' }
];

/** Le pack mis en avant : le premier qui couvre le coût du ticket en cours. */
export function featuredPack(creditsNecessaires: number): Pack['id'] {
	for (const p of PACKS) {
		if (p.credits === 'illimite' || p.credits >= creditsNecessaires) return p.id;
	}
	return 'weekend';
}
