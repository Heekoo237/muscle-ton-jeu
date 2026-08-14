"""Bascule cote ↔ modèle selon la marge du bookmaker, AVEC HYSTÉRÉSIS.

Le book disponible peut changer d'une nuit à l'autre ; sa marge aussi. Sans
hystérésis, une ligue à la frontière basculerait de source sans raison visible.
Règle (décision produit) :
  - une ligue passe au MODÈLE si sa marge moyenne 7 j dépasse 10 % ;
  - elle revient à la COTE seulement si elle repasse sous 8 % sur 7 j ;
  - jamais de bascule sur un seul relevé (on lit une moyenne 7 j).

Quand le modèle prend le relais POUR MARGE, la source est marquée
« model_marge_excessive » (distincte de « model » = marché sans cote) et la
confiance est plafonnée à « modérée ».
"""
from __future__ import annotations

from dataclasses import dataclass

MARGIN_TO_MODEL = 0.10  # bascule cote → modèle si marge 7 j > 10 %
MARGIN_TO_ODDS = 0.08   # retour modèle → cote si marge 7 j < 8 %

SOURCE_MODEL_MARGIN = "model_marge_excessive"


@dataclass(frozen=True)
class ModeDecision:
    mode: str            # "odds" | "model"
    changed: bool        # y a-t-il eu bascule ?
    reason: str | None   # motif de la bascule (pour le journal)


def next_mode(current_mode: str | None, marge_7j: float | None) -> ModeDecision:
    """Applique l'hystérésis. `marge_7j` est une fraction (0,18 = 18 %)."""
    mode = current_mode or "odds"  # défaut optimiste : la cote
    if marge_7j is None:
        return ModeDecision(mode, False, None)  # pas de donnée → on ne bascule pas
    if mode == "odds" and marge_7j > MARGIN_TO_MODEL:
        return ModeDecision("model", True, f"marge 7j {marge_7j:.1%} > {MARGIN_TO_MODEL:.0%} → modèle")
    if mode == "model" and marge_7j < MARGIN_TO_ODDS:
        return ModeDecision("odds", True, f"marge 7j {marge_7j:.1%} < {MARGIN_TO_ODDS:.0%} → cote")
    return ModeDecision(mode, False, None)
