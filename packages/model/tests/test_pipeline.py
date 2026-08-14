"""Tests de la logique PURE du pipeline (compute.py) — sans base ni réseau."""
from __future__ import annotations

import itertools

import numpy as np
import pandas as pd

from mtj_model.constants import (
    FRAGILE_THRESHOLDS,
    PROBABILITY_SOURCE,
    confidence_for,
)
from mtj_model.pipeline.compute import (
    devig_fixture_odds,
    league_predictions,
)


def _synthetic_history(n_teams=6, rounds=4, seed=1) -> pd.DataFrame:
    """Petit championnat jouable : chaque paire se rencontre plusieurs fois."""
    rng = np.random.default_rng(seed)
    teams = [f"T{i}" for i in range(n_teams)]
    rows, day = [], pd.Timestamp("2024-01-01")
    for _ in range(rounds):
        for h, a in itertools.permutations(teams, 2):
            rows.append({
                "home": h, "away": a,
                "fthg": int(rng.poisson(1.4)), "ftag": int(rng.poisson(1.1)),
                "date": day,
            })
            day += pd.Timedelta(days=1)
    return pd.DataFrame(rows)


def test_devig_group_sums_to_one():
    raw = {"WIN_HOME": 2.0, "DRAW": 3.4, "WIN_AWAY": 4.0, "OVER_2_5": 1.9, "UNDER_2_5": 2.0}
    p = devig_fixture_odds(raw)
    assert abs(p["WIN_HOME"] + p["DRAW"] + p["WIN_AWAY"] - 1.0) < 1e-9
    assert abs(p["OVER_2_5"] + p["UNDER_2_5"] - 1.0) < 1e-9


def test_devig_skips_incomplete_group():
    raw = {"WIN_HOME": 2.0, "DRAW": 3.4}  # 1X2 incomplet (pas de WIN_AWAY)
    assert devig_fixture_odds(raw) == {}


def test_unknown_team_yields_no_rows():
    hist = _synthetic_history()
    upcoming = pd.DataFrame([{"fixture_id": 1, "home": "INCONNU", "away": "T0"}])
    assert league_predictions(hist, upcoming, "E0", pd.Timestamp("2024-06-01"), {}) == []


def test_covered_markets_and_sources():
    hist = _synthetic_history()
    upcoming = pd.DataFrame([{"fixture_id": 42, "home": "T0", "away": "T1"}])
    # cotes présentes seulement pour le 1X2 → O/U 2,5 doit basculer en repli
    odds = {42: {"WIN_HOME": 2.1, "DRAW": 3.3, "WIN_AWAY": 3.6}}
    rows = league_predictions(hist, upcoming, "E0", pd.Timestamp("2024-06-01"), odds)

    by_market = {r.marche: r for r in rows}
    # tous les marchés couverts non-BTTS, exactement une fois
    assert set(by_market) == set(PROBABILITY_SOURCE)
    assert "BTTS_YES" not in by_market and "BTTS_NO" not in by_market

    # 1X2 : source cote (dé-vigée) ; O/U 2,5 : cote configurée mais absente → repli
    assert by_market["WIN_HOME"].source == "odds"
    assert by_market["OVER_2_5"].source == "repli"
    assert by_market["UNDER_2_5"].source == "repli"
    # marchés modèle
    assert by_market["DC_HOME_DRAW"].source == "model"
    assert by_market["OVER_1_5"].source == "model"

    # probabilités bornées, seuil de fragilité tracé
    for r in rows:
        assert 0.0 <= r.probabilite <= 1.0
        assert r.seuil_fragile == FRAGILE_THRESHOLDS[r.marche]
        assert 0.0 < r.confiance <= 1.0


def test_odds_source_matches_devig():
    hist = _synthetic_history()
    upcoming = pd.DataFrame([{"fixture_id": 7, "home": "T2", "away": "T3"}])
    odds = {7: {"WIN_HOME": 2.0, "DRAW": 3.4, "WIN_AWAY": 4.0}}
    rows = {r.marche: r for r in league_predictions(hist, upcoming, "E0", pd.Timestamp("2024-06-01"), odds)}
    devig = devig_fixture_odds(odds[7])
    assert abs(rows["WIN_HOME"].probabilite - round(devig["WIN_HOME"], 4)) < 1e-4
    # confiance d'un marché « cote » = normale (1.0)
    assert rows["WIN_HOME"].confiance == confidence_for("E0", "odds")


def test_1x2_probs_are_coherent_triple():
    hist = _synthetic_history()
    upcoming = pd.DataFrame([{"fixture_id": 9, "home": "T4", "away": "T5"}])
    rows = {r.marche: r for r in league_predictions(hist, upcoming, "E0", pd.Timestamp("2024-06-01"), {})}
    total = rows["WIN_HOME"].probabilite + rows["DRAW"].probabilite + rows["WIN_AWAY"].probabilite
    assert abs(total - 1.0) < 0.02  # somme ~1 (arrondis + grille finie)


# --- Parsing des réponses The Odds API (pur, sans réseau) -----------------
from mtj_model.pipeline.provider import parse_odds, parse_scores  # noqa: E402

_ODDS_SAMPLE = [{
    "id": "evt1", "sport_key": "soccer_epl", "commence_time": "2026-08-15T14:00:00Z",
    "home_team": "Arsenal", "away_team": "Chelsea",
    "bookmakers": [{
        "key": "pinnacle",
        "markets": [
            {"key": "h2h", "outcomes": [
                {"name": "Arsenal", "price": 1.90},
                {"name": "Chelsea", "price": 4.20},
                {"name": "Draw", "price": 3.60},
            ]},
            {"key": "totals", "outcomes": [
                {"name": "Over", "price": 1.95, "point": 2.5},
                {"name": "Under", "price": 1.90, "point": 2.5},
                {"name": "Over", "price": 2.60, "point": 3.5},  # doit etre ignore
            ]},
        ],
    }],
}]


def test_parse_odds_maps_markets():
    odds = parse_odds(_ODDS_SAMPLE, "soccer_epl")
    got = {o.marche: o.cote for o in odds}
    assert got == {"WIN_HOME": 1.90, "WIN_AWAY": 4.20, "DRAW": 3.60,
                   "OVER_2_5": 1.95, "UNDER_2_5": 1.90}  # 3,5 ignore
    assert all(o.fixture_ref == "evt1" and o.home == "Arsenal" for o in odds)


def test_parse_odds_skips_event_without_bookmaker():
    ev = [{"id": "e", "commence_time": "2026-08-15T14:00:00Z",
           "home_team": "A", "away_team": "B", "bookmakers": []}]
    assert parse_odds(ev, "soccer_epl") == []


def test_parse_scores_finished_and_pending():
    events = [
        {"id": "f1", "commence_time": "2026-08-10T14:00:00Z", "completed": True,
         "home_team": "A", "away_team": "B",
         "scores": [{"name": "A", "score": "2"}, {"name": "B", "score": "1"}]},
        {"id": "f2", "commence_time": "2026-08-20T14:00:00Z", "completed": False,
         "home_team": "C", "away_team": "D", "scores": None},
    ]
    res = {f.provider_ref: f for f in parse_scores(events, "soccer_epl")}
    assert res["f1"].status == "finished" and res["f1"].score_home == 2 and res["f1"].score_away == 1
    assert res["f2"].status == "scheduled" and res["f2"].score_home is None


# --- Normalisation des noms d'équipes (écriture en base) ------------------
from mtj_model.pipeline.sync import normalize_team_name  # noqa: E402


def test_normalize_collapses_variants():
    # accents, ponctuation, mots de bruit, abréviations connues
    assert normalize_team_name("Manchester Utd") == normalize_team_name("Manchester United")
    assert normalize_team_name("FC Barcelone") == "barcelone"
    assert normalize_team_name("Atlético Madrid") == "atletico madrid"
    assert normalize_team_name("Man Utd") == "manchester united"
