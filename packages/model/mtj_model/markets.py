"""Probabilités des marchés couverts, par sommation de la grille 7×7 (brief §2.2 étape 4).

Les marchés internes correspondent 1:1 au type `market` du schéma SQL et au type
TypeScript `Market`. Seuls les marchés COUVERTS sont produits — jamais corners,
cartons, tirs, buteur, mi-temps (CLAUDE.md).

Squelette — implémentation en Session 7.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np

# Doit rester synchronisé avec `market` (SQL) et `Market` (TS).
COVERED_MARKETS = (
    "WIN_HOME", "DRAW", "WIN_AWAY",
    "DC_HOME_DRAW", "DC_DRAW_AWAY", "DC_HOME_AWAY",
    "OVER_1_5", "UNDER_1_5", "OVER_2_5", "UNDER_2_5", "OVER_3_5", "UNDER_3_5",
    "BTTS_YES", "BTTS_NO",
)


def market_probabilities(matrix: "np.ndarray") -> dict[str, float]:
    """Somme la grille de scores en probabilités de marché.

    | Marché        | Calcul                                  |
    |---------------|-----------------------------------------|
    | WIN_HOME      | cases où buts_dom > buts_ext            |
    | DRAW          | diagonale                               |
    | OVER_N        | cases où total > N                      |
    | BTTS_YES      | cases où les deux valeurs > 0           |
    """
    raise NotImplementedError("Session 7 — sommation de la grille par marché")
