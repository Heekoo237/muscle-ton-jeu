/**
 * lineStatus.ts — Statut d'affichage d'une ligne de ticket, partagé par l'écran
 * de résultat et le détail d'historique (même règle des deux côtés).
 *
 * Règle clé : une sélection n'est « analysée » que si elle a une PROBABILITÉ. Un
 * marché couvert mais sans prédiction (match d'une ligue non couverte, par ex.)
 * reste NON analysé — et une sélection non analysée ne porte AUCUN jugement, ni
 * « solide », ni « fragile ». Juste « non analysé — non facturé ».
 */
export interface LigneStatutIn {
	analysable: boolean;
	probabilitePct: number | null;
	retiree: boolean;
	fragile: boolean;
}

/** Analysée = résolue ET pourvue d'une probabilité (sinon : non analysée). */
export function estAnalysee(l: { analysable: boolean; probabilitePct: number | null }): boolean {
	return l.analysable && l.probabilitePct != null;
}

/** Note factuelle par ligne. Jamais de jugement sur une ligne non analysée. */
export function ligneNote(l: LigneStatutIn): string {
	if (!estAnalysee(l)) return 'Non analysé — non facturé.';
	if (l.retiree) return 'Retirée du ticket renforcé — sélection la plus fragile.';
	if (l.fragile) return 'Sélection fragile — probabilité sous le seuil.';
	return 'Sélection solide.';
}
