"""Probabilités des marchés couverts, par sommation de la grille 7×7 (brief §2.2 étape 4).

Les marchés internes correspondent 1:1 au type `market` du schéma SQL et au type
TypeScript `Market`. Seuls les marchés COUVERTS sont produits — jamais corners,
cartons, tirs, buteur, mi-temps (CLAUDE.md).

Squelette — implémentation en Session 7.
"""
from __future__ import annotations

import numpy as np

# Doit rester synchronisé avec `market` (SQL) et `Market` (TS).
COVERED_MARKETS = (
    "WIN_HOME", "DRAW", "WIN_AWAY",
    "DC_HOME_DRAW", "DC_DRAW_AWAY", "DC_HOME_AWAY",
    "OVER_1_5", "UNDER_1_5", "OVER_2_5", "UNDER_2_5", "OVER_3_5", "UNDER_3_5",
    "BTTS_YES", "BTTS_NO",
)


def market_probabilities(matrix: np.ndarray) -> dict[str, float]:
    """Somme la grille de scores 7×7 en probabilités des 14 marchés couverts.

    | Marché        | Calcul                                  |
    |---------------|-----------------------------------------|
    | WIN_HOME      | cases où buts_dom > buts_ext            |
    | DRAW          | diagonale                               |
    | OVER_N        | cases où total > N                      |
    | BTTS_YES      | cases où les deux valeurs > 0           |
    """
    n = matrix.shape[0]
    idx = np.arange(n)
    home = idx[:, None]
    away = idx[None, :]
    total = home + away

    win_home = float(matrix[home > away].sum())
    draw = float(np.trace(matrix))
    win_away = float(matrix[home < away].sum())

    over_15 = float(matrix[total >= 2].sum())
    over_25 = float(matrix[total >= 3].sum())
    over_35 = float(matrix[total >= 4].sum())
    btts_yes = float(matrix[(home >= 1) & (away >= 1)].sum())

    return {
        "WIN_HOME": win_home,
        "DRAW": draw,
        "WIN_AWAY": win_away,
        "DC_HOME_DRAW": win_home + draw,
        "DC_DRAW_AWAY": draw + win_away,
        "DC_HOME_AWAY": win_home + win_away,
        "OVER_1_5": over_15,
        "UNDER_1_5": 1.0 - over_15,
        "OVER_2_5": over_25,
        "UNDER_2_5": 1.0 - over_25,
        "OVER_3_5": over_35,
        "UNDER_3_5": 1.0 - over_35,
        "BTTS_YES": btts_yes,
        "BTTS_NO": 1.0 - btts_yes,
    }
