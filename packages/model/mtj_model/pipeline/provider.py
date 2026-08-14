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
TOTALS_POINT = 2.5                  # la SEULE ligne plus/moins qu'on price (marché du ticket)


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
    """Réponse /odds → cotes internes. Ne garde que h2h et plus/moins 2,5.

    Deux books sont choisis SÉPARÉMENT :
      - 1X2 (h2h) → book de référence (Pinnacle prioritaire, sinon premier EU),
        pour rester sur la ligne calibrée au backtest ;
      - plus/moins 2,5 → le book le plus SERRÉ qui poste RÉELLEMENT une ligne 2,5.
        La ligne principale d'un book flotte selon le match (2,25 / 2,75 / 3,0…),
        donc se limiter au book de référence perd le 2,5 ~70 % du temps. Le 2,5
        existe toujours chez UN book EU — on va le chercher là où il est.
    """
    out: list[ProviderOdds] = []
    for ev in events:
        home, away = ev.get("home_team"), ev.get("away_team")
        date = _parse_dt(ev.get("commence_time"))
        if not (home and away and date):
            continue
        books = ev.get("bookmakers", [])
        fid = str(ev.get("id"))
        # (book, marché lu chez ce book) : 1X2 chez la référence, totals chez le
        # book le plus serré qui a réellement la ligne 2,5.
        for book, want in ((_pick_bookmaker(books), "h2h"),
                           (_pick_totals_book(books), "totals")):
            if not book:
                continue
            book_key = book.get("key") or BOOKMAKER
            for market in book.get("markets", []):
                if market.get("key") != want:
                    continue
                for oc in market.get("outcomes", []):
                    marche = _map_outcome(want, oc, home, away)
                    price = oc.get("price")
                    if marche and isinstance(price, (int, float)) and price > 1:
                        out.append(ProviderOdds(
                            fixture_ref=fid, league_ref=league_ref,
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


def _totals_pair(bookmaker: dict, point: float = TOTALS_POINT) -> tuple[float, float] | None:
    """(cote Over, cote Under) au point voulu chez CE book, ou None s'il ne le poste pas."""
    over = under = None
    for market in bookmaker.get("markets", []):
        if market.get("key") != "totals":
            continue
        for oc in market.get("outcomes", []):
            if oc.get("point") != point:
                continue
            price = oc.get("price")
            if oc.get("name") == "Over":
                over = price
            elif oc.get("name") == "Under":
                under = price
    if isinstance(over, (int, float)) and isinstance(under, (int, float)) and over > 1 and under > 1:
        return float(over), float(under)
    return None


def _pick_totals_book(bookmakers: list[dict], point: float = TOTALS_POINT) -> dict | None:
    """Book le plus SERRÉ qui poste une ligne plus/moins au point voulu.

    Pinnacle prioritaire quand il a la ligne (c'est le sharp du backtest et, de
    fait, le plus serré). Sinon, on prend le book EU de marge minimale — le 2,5
    d'un book qui le met en ligne principale, pas une ligne alternative molle.
    """
    best: dict | None = None
    best_margin: float | None = None
    for b in bookmakers:
        pair = _totals_pair(b, point)
        if pair is None:
            continue
        if b.get("key") == BOOKMAKER:
            return b  # Pinnacle a le 2,5 → référence directe
        margin = 1 / pair[0] + 1 / pair[1] - 1
        if best_margin is None or margin < best_margin:
            best_margin, best = margin, b
    return best


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
        self.credits_used_period: int | None = None  # crédits déjà consommés sur le palier

    def _get(self, path: str, params: dict) -> list[dict]:
        params = {"apiKey": self._key, **params}
        url = f"{API_BASE}/{path}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "mtj-pipeline/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (URL maîtrisée)
            payload = json.loads(r.read())
            # The Odds API facture par en-têtes : coût de CETTE requête + solde + usage.
            self.credits_used += int(r.headers.get("x-requests-last") or 0)
            remaining = r.headers.get("x-requests-remaining")
            if remaining is not None:
                self.credits_remaining = int(float(remaining))
            used = r.headers.get("x-requests-used")
            if used is not None:
                self.credits_used_period = int(float(used))
        return payload

    @property
    def credits_quota(self) -> int | None:
        """Taille du PALIER détectée = restants + déjà consommés. C'est le vrai
        plafond mensuel (500 gratuit, 20 000 payant…), lu chez le fournisseur —
        jamais supposé. None tant qu'aucun appel n'a renseigné les en-têtes."""
        if self.credits_remaining is None or self.credits_used_period is None:
            return None
        return self.credits_remaining + self.credits_used_period

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
