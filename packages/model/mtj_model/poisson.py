"""Poisson bivarié + ajustement Dixon-Coles (brief §2.2 étape 3).

Frontière du produit : TOUT ce qui produit un nombre vit ici, en code
déterministe. Même entrée, même sortie — c'est ce qui rend le backtest possible.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import poisson

GRID_SIZE = 7  # scores de 0-0 à 6-6 (brief §2.2 étape 3)


def dc_tau(matrix: np.ndarray, lambda_home: float, lambda_away: float, rho: float) -> np.ndarray:
    """Applique la correction Dixon-Coles sur les 4 scores faibles.

    La Poisson pure sous-estime la corrélation à bas score (0-0, 1-0, 0-1, 1-1).
    """
    m = matrix.copy()
    m[0, 0] *= 1.0 - lambda_home * lambda_away * rho
    m[0, 1] *= 1.0 + lambda_home * rho
    m[1, 0] *= 1.0 + lambda_away * rho
    m[1, 1] *= 1.0 - rho
    return m


def score_matrix(lambda_home: float, lambda_away: float, rho: float = 0.0, size: int = GRID_SIZE) -> np.ndarray:
    """Grille `size`×`size` des probabilités de score, ajustée Dixon-Coles.

    :param lambda_home: buts attendus domicile (λ_domicile)
    :param lambda_away: buts attendus extérieur (λ_extérieur)
    :param rho: paramètre de dépendance Dixon-Coles sur les scores faibles
    :returns: matrice (size, size) normalisée à 1 (ligne = buts domicile)
    """
    ph = poisson.pmf(np.arange(size), lambda_home)
    pa = poisson.pmf(np.arange(size), lambda_away)
    grid = np.outer(ph, pa)
    grid = dc_tau(grid, lambda_home, lambda_away, rho)
    grid = np.clip(grid, 0.0, None)  # τ peut rendre une case légèrement négative
    total = grid.sum()
    return grid / total if total > 0 else grid
