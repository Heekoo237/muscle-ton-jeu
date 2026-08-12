"""Comparaison aux cotes de clôture (brief §2.3b). Squelette — Session 7."""
from __future__ import annotations


def implied_probability(odds: float) -> float:
    """Probabilité implicite brute d'une cote décimale (avant retrait de marge)."""
    raise NotImplementedError("Session 7 — 1/cote, puis normalisation de la marge")


def compare_to_market(model_probs, closing_odds):
    """Écart systématique éventuel entre modèle et marché sans marge."""
    raise NotImplementedError("Session 7 — comparaison modèle vs marché dé-margé")
