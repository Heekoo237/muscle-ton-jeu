"""Force de chaque équipe (brief §2.2 étape 1).

À partir des buts marqués/encaissés sur les 20 derniers matchs : forces
offensive/défensive domicile et extérieur, pondérées par la force de
l'adversaire et par la récence (pondération exponentielle).

Squelette de signatures — implémentation en Session 7.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TeamStrength:
    attaque_dom: float
    defense_dom: float
    attaque_ext: float
    defense_ext: float


def compute_strengths(matches, half_life_days: float = 30.0) -> dict[int, TeamStrength]:
    """Calcule les forces par équipe depuis un historique de matchs.

    :param matches: résultats récents (DataFrame ou itérable de matchs)
    :param half_life_days: demi-vie de la pondération par récence
    :returns: force par team_id
    """
    raise NotImplementedError("Session 7 — forces d'équipes pondérées récence + adversaire")
