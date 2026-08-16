/**
 * operators.ts — Pays et opérateurs Mobile Money. Partagé client/serveur.
 *
 * DÉCISION (vérifiée) : on ne DÉDUIT JAMAIS l'opérateur du préfixe. Wave marche sur
 * n'importe quel numéro ivoirien (~70 % du marché), et le Bénin est interopérable
 * depuis 2025 (un seul numéro pour les trois portefeuilles). Deviner serait FAUX
 * dans la majorité des cas en Côte d'Ivoire. L'utilisateur choisit toujours,
 * explicitement — un geste de plus, zéro erreur.
 *
 * VALIDATION : en cas de doute, on ACCEPTE. On ne bloque que sur la longueur (connue
 * et stable par pays). C'est l'opérateur qui tranchera au paiement, pas nous — rejeter
 * un numéro valide serait pire qu'une validation permissive.
 */

export type PaysCode = 'CM' | 'GA' | 'BJ' | 'CI';

export interface Operateur {
	id: string;
	nom: string;
	/** Couleur de marque (reconnaissance visuelle plus rapide que le nom). */
	couleur: string;
	/** Contraste du texte posé sur la couleur. */
	texte: 'clair' | 'sombre';
}

export interface Pays {
	code: PaysCode;
	nom: string;
	/** Gentilé pour le message d'erreur (« Un numéro camerounais a 9 chiffres »). */
	gentile: string;
	indicatif: string;
	drapeau: string;
	/** Nombre de chiffres du numéro national, tel que l'utilisateur le tape localement. */
	longueur: number;
	operateurs: Operateur[];
}

const MTN: Operateur = { id: 'mtn', nom: 'MTN MoMo', couleur: '#FFCC00', texte: 'sombre' };
const ORANGE: Operateur = { id: 'orange', nom: 'Orange Money', couleur: '#FF7900', texte: 'clair' };
const WAVE: Operateur = { id: 'wave', nom: 'Wave', couleur: '#1DC3FF', texte: 'sombre' };
const MOOV: Operateur = { id: 'moov', nom: 'Moov Money', couleur: '#F58220', texte: 'clair' };
const AIRTEL: Operateur = { id: 'airtel', nom: 'Airtel Money', couleur: '#E40000', texte: 'clair' };
const CELTIIS: Operateur = { id: 'celtiis', nom: 'Celtiis Cash', couleur: '#00A551', texte: 'clair' };

export const PAYS: Pays[] = [
	{
		code: 'CM', nom: 'Cameroun', gentile: 'camerounais', indicatif: '+237', drapeau: '🇨🇲',
		longueur: 9, operateurs: [MTN, ORANGE, WAVE]
	},
	{
		code: 'GA', nom: 'Gabon', gentile: 'gabonais', indicatif: '+241', drapeau: '🇬🇦',
		longueur: 9, operateurs: [AIRTEL, MOOV]
	},
	{
		code: 'BJ', nom: 'Bénin', gentile: 'béninois', indicatif: '+229', drapeau: '🇧🇯',
		longueur: 10, operateurs: [MTN, MOOV, CELTIIS]
	},
	{
		code: 'CI', nom: "Côte d'Ivoire", gentile: 'ivoirien', indicatif: '+225', drapeau: '🇨🇮',
		longueur: 10, operateurs: [WAVE, ORANGE, MTN, MOOV]
	}
];

export const PAYS_DEFAUT: PaysCode = 'CM';

export function paysDe(code: string): Pays | undefined {
	return PAYS.find((p) => p.code === code);
}

/** Chiffres seulement (retire espaces, tirets, indicatif collé…). */
export function chiffres(saisie: string): string {
	return saisie.replace(/\D/g, '');
}

export interface ValidationNumero {
	ok: boolean;
	/** Message CLAIR, jamais « format invalide ». Vide si ok. */
	message: string;
	/** Chiffres retenus (pour l'affichage/stockage). */
	valeur: string;
}

/**
 * Valide un numéro pour un pays. On ne bloque que sur la LONGUEUR (connue par pays).
 * Message explicite si incomplet. En cas de doute, on accepte (l'opérateur tranchera).
 */
export function validerNumero(saisie: string, pays: Pays): ValidationNumero {
	const d = chiffres(saisie);
	if (d.length === 0) return { ok: false, message: '', valeur: d }; // vide : pas d'erreur affichée
	if (d.length < pays.longueur) {
		return { ok: false, message: `Un numéro ${pays.gentile} a ${pays.longueur} chiffres.`, valeur: d };
	}
	if (d.length > pays.longueur) {
		return { ok: false, message: `Un numéro ${pays.gentile} a ${pays.longueur} chiffres, pas plus.`, valeur: d };
	}
	return { ok: true, message: '', valeur: d };
}

/** MSISDN complet à stocker/afficher : indicatif + numéro national. */
export function msisdnComplet(pays: Pays, numeroNational: string): string {
	return `${pays.indicatif} ${numeroNational}`;
}

export function operateurDe(pays: Pays, id: string): Operateur | undefined {
	return pays.operateurs.find((o) => o.id === id);
}
