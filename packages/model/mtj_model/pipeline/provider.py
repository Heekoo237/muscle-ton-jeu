"""Fournisseur de données sportives — encapsulé dans un SEUL fichier (règle
d'archi n°4). Tout le reste du pipeline ignore d'où viennent calendrier,
résultats et cotes ; il ne connaît que cette interface.

Le jour où l'on change de fournisseur (CSV gratuit → API payante), on ne touche
QUE ce fichier. Le calcul, l'écriture en base et la surveillance ne bougent pas.

Ici, aucune implémentation réelle n'est branchée (réseau bloqué dans ce bac à
sable, et pas de clé d'API). `get_provider()` renvoie un fournisseur nul qui
lève explicitement : le branchement réel se fait en fournissant une classe qui
respecte le protocole ci-dessous.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class ProviderFixture:
    provider_ref: str          # identifiant du match chez le fournisseur
    league_ref: str            # identifiant du championnat (→ leagues.provider_ref)
    date_utc: datetime
    home: str
    away: str
    status: str                # 'scheduled' | 'finished' | 'postponed' | …
    score_home: int | None = None
    score_away: int | None = None


@dataclass(frozen=True)
class ProviderOdds:
    fixture_ref: str
    marche: str                # marché interne (WIN_HOME, OVER_2_5, …)
    cote: float                # cote décimale
    bookmaker: str = "pinnacle"


class SportsDataProvider(Protocol):
    """Contrat minimal. Une implémentation réelle enveloppe l'API du fournisseur."""

    def fixtures(self, days_ahead: int) -> list[ProviderFixture]:
        """Calendrier des `days_ahead` prochains jours + résultats récents."""
        ...

    def odds(self, fixtures: list[ProviderFixture]) -> list[ProviderOdds]:
        """Cotes courantes des matchs donnés (1X2 et plus/moins 2,5 au minimum)."""
        ...


class NullProvider:
    """Fournisseur non branché : lève tant qu'aucune source réelle n'est fournie."""

    def fixtures(self, days_ahead: int):
        raise NotImplementedError(
            "Aucun fournisseur de données sportives branché. Fournis une classe "
            "SportsDataProvider (API réelle) et sélectionne-la dans get_provider()."
        )

    def odds(self, fixtures):
        raise NotImplementedError(
            "Aucun fournisseur de cotes branché. Voir provider.py."
        )


def get_provider() -> SportsDataProvider:
    """Sélectionne le fournisseur selon l'environnement (un seul point de choix)."""
    kind = os.environ.get("MTJ_PROVIDER", "null")
    if kind == "null":
        return NullProvider()
    # Brancher ici les implémentations réelles :
    #   if kind == "apifootball": return ApiFootballProvider(os.environ["MTJ_PROVIDER_KEY"])
    raise SystemExit(f"Fournisseur inconnu : {kind!r}. Voir provider.py.")
