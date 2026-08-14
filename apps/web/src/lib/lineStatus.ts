/**
 * lineStatus.ts — Note d'affichage d'une ligne de ticket, partagée par l'écran de
 * résultat et le détail d'historique (même règle des deux côtés).
 *
 * La règle « analysable » (résolu ≠ analysable) vit dans UNE fonction, `isAnalysable`
 * (server/domain/ticket.ts), et est tranchée UNE fois côté serveur : le VM porte le
 * booléen `analysable` déjà calculé. Ici on ne re-dérive PAS la règle — on lit le
 * booléen. Une sélection non analysée ne porte AUCUN jugement, ni « solide », ni
 * « fragile ». Juste « non analysé — non facturé ».
 */
export interface LigneStatutIn {
	analysable: boolean;
	retiree: boolean;
	fragile: boolean;
}

/** Note factuelle par ligne. Jamais de jugement sur une ligne non analysée. */
export function ligneNote(l: LigneStatutIn): string {
	if (!l.analysable) return 'Non analysé — non facturé.';
	if (l.retiree) return 'Retirée du ticket renforcé — sélection la plus fragile.';
	if (l.fragile) return 'Sélection fragile — probabilité sous le seuil.';
	return 'Sélection solide.';
}
