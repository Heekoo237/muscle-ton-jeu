"""Calibration (brief §2.3a). Squelette — implémentation Session 7."""
from __future__ import annotations


def calibration_curve(predictions, outcomes, bin_width: float = 0.05):
    """Fréquence observée par tranche de probabilité prédite.

    :returns: pour chaque tranche : (proba_moyenne_prédite, fréquence_observée, n)
    """
    raise NotImplementedError("Session 7 — courbe de calibration par tranches de 5 %")
