"""Cotes de clôture → probabilités du marché, marge retirée (brief §2.3b).

Deux méthodes de dé-margeage testées (brief : « logarithmique ou proportionnelle
— teste les deux ») :

  - proportionnelle : p_i = (1/o_i) / Σ(1/o_j). La marge est répartie au prorata.
  - puissance (« logarithmique ») : p_i = (1/o_i)^k, avec k tel que Σ p_i = 1.
    k > 1 comprime davantage les outsiders que les favoris (corrige une partie du
    biais favori-outsider).

Rien ici ne « produit » un nombre pour l'utilisateur : c'est de l'analyse hors
ligne, déterministe, pour le backtest.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import brentq


def implied_probability(odds: float) -> float:
    """Probabilité implicite brute d'une cote décimale (marge incluse)."""
    return 1.0 / odds


def devig_proportional(odds) -> np.ndarray:
    """Dé-margeage proportionnel (normalisation multiplicative)."""
    inv = 1.0 / np.asarray(odds, dtype=float)
    return inv / inv.sum()


def devig_power(odds) -> np.ndarray:
    """Dé-margeage par puissance : p_i = (1/o_i)^k, Σ p_i = 1 (méthode logarithmique)."""
    inv = 1.0 / np.asarray(odds, dtype=float)
    s = inv.sum()
    if abs(s - 1.0) < 1e-9:
        return inv
    k = brentq(lambda k: np.sum(inv**k) - 1.0, 0.2, 20.0)
    return inv**k


DEVIG = {"proportionnelle": devig_proportional, "puissance": devig_power}
