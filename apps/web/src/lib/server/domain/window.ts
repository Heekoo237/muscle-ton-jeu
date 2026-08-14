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
