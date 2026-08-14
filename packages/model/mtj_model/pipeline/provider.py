"""Fournisseur de données sportives — encapsulé dans un SEUL fichier (règle
d'archi n°4). Tout le reste du pipeline ignore d'où viennent calendrier,
résultats et cotes ; il ne connaît que l'interface `SportsDataProvider`.

Implémentation branchée : **The Odds API** (the-odds-api.com), orienté cotes,
Pinnacle disponible en région `eu` (notre référence de dé-vigeage).

Le jour où l'on change de fournisseur, on ne touche QUE ce fichier. Le parsing
des réponses est isolé en fonctions PURES (parse_*), testables sans réseau.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

API_BASE = "https://api.the-odds-api.com/v4"
REGION = "eu"                       # bookmakers européens (dont Pinnacle)
BOOKMAKER = "pinnacle"              # sharp, cohérent avec le backtest
MARKETS = "h2h,totals"             # 1X2 + plus/moins


@dataclass(frozen=True)
class ProviderFixture:
    provider_ref: str          # identifiant du match chez le fournisseur (event id)
    league_ref: str            # clé The Odds API du championnat (soccer_epl…)
    date_utc: datetime
    home: str
    away: str
    status: str                # 'scheduled' | 'finished'
    score_home: int | None = None
    score_away: int | None = None


@dataclass(frozen=True)
class ProviderOdds:
    fixture_ref: str
    league_ref: str
    date_utc: datetime
    home: str
    away: str
    marche: str                # marché interne (WIN_HOME, OVER_2_5, …)
    cote: float                # cote décimale
    bookmaker: str = BOOKMAKER


class SportsDataProvider(Protocol):
    def sports(self) -> list[dict]:
        """Liste brute des sports/ligues actifs chez le fournisseur (/sports)."""
        ...

    def odds(self, league_ref: str, days_ahead: int) -> list[ProviderOdds]:
        """Cotes courantes des matchs à venir d'un championnat."""
        ...

    def scores(self, league_ref: str, days_from: int) -> list[ProviderFixture]:
        """Résultats récents d'un championnat (pour rafraîchir l'historique)."""
        ...


# --------------------------------------------------------------------------
# Parsing PUR des réponses The Odds API (aucun réseau ici → testable).
# --------------------------------------------------------------------------
_H2H = {"__home__": "WIN_HOME", "Draw": "DRAW", "__away__": "WIN_AWAY"}


def parse_odds(events: list[dict], league_ref: str) -> list[ProviderOdds]:
    """Réponse /odds → cotes internes. Ne garde que h2h et plus/moins 2,5."""
    out: list[ProviderOdds] = []
    for ev in events:
        home, away = ev.get("home_team"), ev.get("away_team")
        date = _parse_dt(ev.get("commence_time"))
        if not (home and away and date):
            continue
        book = _pick_bookmaker(ev.get("bookmakers", []))
        if not book:
            continue
        book_key = book.get("key") or BOOKMAKER  # bookmaker RÉELLEMENT utilisé
        for market in book.get("markets", []):
            key = market.get("key")
            for oc in market.get("outcomes", []):
                marche = _map_outcome(key, oc, home, away)
                price = oc.get("price")
                if marche and isinstance(price, (int, float)) and price > 1:
                    out.append(ProviderOdds(
                        fixture_ref=str(ev.get("id")), league_ref=league_ref,
                        date_utc=date, home=home, away=away,
                        marche=marche, cote=float(price), bookmaker=book_key,
                    ))
    return out


def parse_scores(events: list[dict], league_ref: str) -> list[ProviderFixture]:
    """Réponse /scores → matchs terminés avec score (ignore les non terminés)."""
    out: list[ProviderFixture] = []
    for ev in events:
        home, away = ev.get("home_team"), ev.get("away_team")
        date = _parse_dt(ev.get("commence_time"))
        if not (home and away and date):
            continue
        finished = bool(ev.get("completed"))
        sh, sa = _extract_scores(ev.get("scores"), home, away)
        out.append(ProviderFixture(
            provider_ref=str(ev.get("id")), league_ref=league_ref, date_utc=date,
            home=home, away=away,
            status="finished" if finished else "scheduled",
            score_home=sh if finished else None,
            score_away=sa if finished else None,
        ))
    return out


def _map_outcome(market_key: str, outcome: dict, home: str, away: str) -> str | None:
    name = outcome.get("name")
    if market_key == "h2h":
        if name == home:
            return "WIN_HOME"
        if name == away:
            return "WIN_AWAY"
        if name == "Draw":
            return "DRAW"
        return None
    if market_key == "totals" and outcome.get("point") == 2.5:
        if name == "Over":
            return "OVER_2_5"
        if name == "Under":
            return "UNDER_2_5"
    return None


def _pick_bookmaker(bookmakers: list[dict]) -> dict | None:
    """Notre bookmaker de référence si présent, sinon le premier disponible."""
    if not bookmakers:
        return None
    for b in bookmakers:
        if b.get("key") == BOOKMAKER:
            return b
    return bookmakers[0]


def _extract_scores(scores, home: str, away: str) -> tuple[int | None, int | None]:
    if not scores:
        return None, None
    by_name = {s.get("name"): s.get("score") for s in scores}
    try:
        return int(by_name.get(home)), int(by_name.get(away))
    except (TypeError, ValueError):
        return None, None


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


# --------------------------------------------------------------------------
# Implémentations concrètes
# --------------------------------------------------------------------------
class TheOddsApiProvider:
    """Client The Odds API. La clé vient de MTJ_PROVIDER_KEY (jamais en dur)."""

    def __init__(self, api_key: str):
        self._key = api_key
        self.credits_used = 0            # crédits consommés cette session (somme des requêtes)
        self.credits_remaining: int | None = None  # crédits restants sur le palier

    def _get(self, path: str, params: dict) -> list[dict]:
        params = {"apiKey": self._key, **params}
        url = f"{API_BASE}/{path}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "mtj-pipeline/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (URL maîtrisée)
            payload = json.loads(r.read())
            # The Odds API facture par en-têtes : coût de CETTE requête + solde.
            self.credits_used += int(r.headers.get("x-requests-last") or 0)
            remaining = r.headers.get("x-requests-remaining")
            if remaining is not None:
                self.credits_remaining = int(float(remaining))
        return payload

    def sports(self) -> list[dict]:
        return self._get("sports", {"all": "true"})

    def odds(self, league_ref: str, days_ahead: int = 7) -> list[ProviderOdds]:
        # On demande TOUS les bookmakers EU (pas seulement Pinnacle) : les petites
        # ligues (Grèce, Écosse) ne sont pas cotées par Pinnacle. parse_odds
        # préfère Pinnacle quand il est présent, sinon prend un autre book EU.
        events = self._get(f"sports/{league_ref}/odds", {
            "regions": REGION, "markets": MARKETS, "oddsFormat": "decimal",
        })
        return parse_odds(events, league_ref)

    def scores(self, league_ref: str, days_from: int = 3) -> list[ProviderFixture]:
        events = self._get(f"sports/{league_ref}/scores", {"daysFrom": str(days_from)})
        return parse_scores(events, league_ref)


class NullProvider:
    """Fournisseur non branché : lève tant qu'aucune clé n'est fournie."""

    def sports(self):
        raise NotImplementedError("Fournisseur non branché — MTJ_PROVIDER/MTJ_PROVIDER_KEY absents.")

    def odds(self, league_ref, days_ahead=7):
        raise NotImplementedError("Fournisseur non branché — voir provider.py.")

    def scores(self, league_ref, days_from=3):
        raise NotImplementedError("Fournisseur non branché — voir provider.py.")


def get_provider() -> SportsDataProvider:
    """Sélectionne le fournisseur selon l'environnement (un seul point de choix)."""
    kind = os.environ.get("MTJ_PROVIDER", "null")
    if kind == "null":
        return NullProvider()
    if kind == "oddsapi":
        key = os.environ.get("MTJ_PROVIDER_KEY")
        if not key:
            raise SystemExit("MTJ_PROVIDER=oddsapi mais MTJ_PROVIDER_KEY absent.")
        return TheOddsApiProvider(key)
    raise SystemExit(f"Fournisseur inconnu : {kind!r}. Voir provider.py.")
