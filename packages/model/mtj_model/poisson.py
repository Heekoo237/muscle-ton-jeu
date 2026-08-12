"""Poisson bivarié + ajustement Dixon-Coles (brief §2).

Frontière du produit : TOUT ce qui produit un nombre vit ici, en code
déterministe. Même entrée, même sortie — c'est ce qui rend le backtest possible.

Ce module est un squelette de signatures. L'implémentation réelle est le
livrable de la Session 7 (jalon-barrière) et ne doit pas être compressée.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np

GRID_SIZE = 7  # scores de 0-0 à 6-6 (brief §2.2 étape 3)


def score_matrix(lambda_home: float, lambda_away: float, rho: float = 0.0) -> "np.ndarray":
    """Grille 7×7 des probabilités de score, ajustée Dixon-Coles sur (0-0,1-0,0-1,1-1).

    :param lambda_home: buts attendus domicile (λ_domicile)
    :param lambda_away: buts attendus extérieur (λ_extérieur)
    :param rho: paramètre de dépendance Dixon-Coles sur les scores faibles
    :returns: matrice (7,7) sommant ~1
    """
    raise NotImplementedError("Session 7 — Poisson bivarié + Dixon-Coles")
