/**
 * window.ts — Fenêtre d'analyse : combien de jours à venir on résout et on price.
 *
 * INVARIANT : cette valeur DOIT être égale à `DEFAULT_DAYS` du pipeline nocturne
 * (packages/model/mtj_model/pipeline/nightly.py). Le nocturne calcule les
 * probabilités pour cette fenêtre ; l'app résout les tickets sur la MÊME fenêtre.
 * Si l'app résout plus loin que le nocturne ne calcule, un match ressort « résolu »
 * mais sans probabilité → « non analysé » à tort. Les deux bougent ENSEMBLE.
 *
 * 7 jours était trop court : un parieur compose son ticket une à trois semaines
 * avant les matchs. On couvre l'horizon réel d'un ticket (dans la limite de ce que
 * le fournisseur a déjà coté — au-delà, le match n'est pas encore en base).
 */
export const ANALYSIS_WINDOW_DAYS = 21;

/**
 * Horizon de RÉSOLUTION : jusqu'où on charge les matchs pour DIAGNOSTIQUER (plus
 * large que la fenêtre d'analyse). Sert à distinguer honnêtement « le match existe
 * mais il est au-delà de la période analysée » (hors fenêtre) de « on n'a pas
 * retrouvé ce match » (aucune fixture entre ces deux équipes). Un match trouvé
 * entre 21 et 60 jours est réel mais pas encore analysé ; au-delà, il n'est
 * généralement pas encore coté, donc pas en base → « pas retrouvé ».
 */
export const RESOLUTION_HORIZON_DAYS = 60;

/**
 * Recul de RÉSOLUTION : on charge aussi les matchs dont le coup d'envoi est PASSÉ
 * (en cours ou récemment terminés), pour distinguer « déjà commencé » de « pas
 * retrouvé ». Un match en cours a `date_utc < now` : sans ce recul, il est filtré
 * et la résolution dit à tort « on n'a pas retrouvé ce match ».
 */
export const RESOLUTION_LOOKBACK_HOURS = 48;

/**
 * Durée après laquelle un match est SÛREMENT terminé, coup d'envoi compris. Sert à
 * l'AFFICHAGE du statut (« tous les matchs sont joués ») quand le score n'est pas
 * encore en base : on ne devine pas un résultat, on constate juste que l'heure de fin
 * est passée. 90 min de jeu + mi-temps + arrêts + marge de retard → 3 h, généreux
 * exprès (mieux vaut « en attente » une heure de trop que « terminé » trop tôt).
 */
export const MATCH_DUREE_MS = 3 * 3600_000;
