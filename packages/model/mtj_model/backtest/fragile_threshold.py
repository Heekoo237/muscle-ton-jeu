"""Calibration du seuil « fragile » (brief §2.3c). Squelette — Session 7.

Le seuil ne se fixe pas arbitrairement : il se détermine sur données réelles.
Le résultat remplace `DEFAULT_FRAGILE_THRESHOLD` côté TypeScript.
"""
from __future__ import annotations

SUGGESTED_START = 0.55  # point de départ à tester, pas une valeur définitive


def calibrate_threshold(selections, ticket_outcomes) -> float:
    """Niveau de probabilité sous lequel une sélection fait tomber un ticket."""
    raise NotImplementedError("Session 7 — calibration du seuil fragile sur données réelles")
