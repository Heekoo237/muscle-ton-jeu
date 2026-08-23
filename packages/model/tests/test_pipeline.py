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


def test_repli_rates_ranks_worst_first_and_ignores_empty_base():
    from mtj_model.pipeline.nightly import _repli_rates
    repli = {
        "G1": {"OVER_2_5": [4, 4], "WIN_HOME": [0, 4]},   # 100 % et 0 %
        "E0": {"OVER_2_5": [2, 5]},                        # 40 %
        "B1": {"UNDER_2_5": [0, 0]},                       # base vide → ignoré
    }
    out = _repli_rates(repli)
    assert [(d["ligue"], d["marche"], d["taux"]) for d in out] == [
        ("G1", "OVER_2_5", 1.0), ("E0", "OVER_2_5", 0.4), ("G1", "WIN_HOME", 0.0),
    ]
    assert all(d["base"] > 0 for d in out)  # jamais de base vide


def test_totals_book_report_groups_by_league_and_book_with_margin():
    from mtj_model.pipeline.nightly import _totals_book_report
    fixtures = [(1, "B1"), (2, "B1"), (3, "N1"), (4, "N1")]
    odds = {
        1: {"OVER_2_5": 2.0, "UNDER_2_5": 2.0},    # marge 0 %
        2: {"OVER_2_5": 1.90, "UNDER_2_5": 1.90},  # marge ~5,26 %
        3: {"OVER_2_5": 1.80, "UNDER_2_5": 1.80},  # marge ~11,1 %
        4: {"WIN_HOME": 2.0},                       # pas de 2,5 → ignoré
    }
    books = {1: {"OVER_2_5": "pinnacle"}, 2: {"OVER_2_5": "pinnacle"},
             3: {"UNDER_2_5": "bwin"}, 4: {}}
    rep = _totals_book_report(fixtures, odds, books)
    assert rep["B1"] == [{"book": "pinnacle", "matchs": 2, "marge_pct": 2.63}]
    assert rep["N1"] == [{"book": "bwin", "matchs": 1, "marge_pct": 11.11}]


def test_leagues_over_totals_margin_weights_by_matches():
    from mtj_model.pipeline.nightly import leagues_over_totals_margin
    night = {
        "B1": [{"book": "x", "matchs": 8, "marge_pct": 9.0}],           # 9 % > 8 → over
        "N1": [{"book": "y", "matchs": 6, "marge_pct": 3.0},
               {"book": "z", "matchs": 2, "marge_pct": 5.0}],           # pondérée 3,5 % → non
        "T1": [{"book": "w", "matchs": 0, "marge_pct": 20.0}],          # base vide → ignoré
    }
    assert leagues_over_totals_margin(night, 8.0) == ["B1"]


def test_parse_odds_skips_event_without_bookmaker():
    ev = [{"id": "e", "commence_time": "2026-08-15T14:00:00Z",
           "home_team": "A", "away_team": "B", "bookmakers": []}]
    assert parse_odds(ev, "soccer_epl") == []


# Le book de référence poste sa ligne totals AILLEURS qu'à 2,5 (2,75), mais un
# autre book EU a bien le 2,5 : on doit récupérer le 2,5 chez ce book, et garder
# le 1X2 chez la référence. (Régression : avant, le 2,5 tombait en repli ~70 %.)
_ODDS_TOTALS_ELSEWHERE = [{
    "id": "evt2", "commence_time": "2026-08-15T14:00:00Z",
    "home_team": "Arsenal", "away_team": "Chelsea",
    "bookmakers": [
        {"key": "pinnacle", "markets": [
            {"key": "h2h", "outcomes": [
                {"name": "Arsenal", "price": 1.90},
                {"name": "Chelsea", "price": 4.20},
                {"name": "Draw", "price": 3.60},
            ]},
            {"key": "totals", "outcomes": [   # ligne principale Pinnacle = 2,75
                {"name": "Over", "price": 2.05, "point": 2.75},
                {"name": "Under", "price": 1.80, "point": 2.75},
            ]},
        ]},
        {"key": "bwin", "markets": [
            {"key": "totals", "outcomes": [   # bwin a bien le 2,5
                {"name": "Over", "price": 1.90, "point": 2.5},
                {"name": "Under", "price": 1.95, "point": 2.5},
            ]},
        ]},
    ],
}]


def test_parse_odds_totals_from_other_book_when_ref_lacks_2_5():
    odds = {(o.marche): o for o in parse_odds(_ODDS_TOTALS_ELSEWHERE, "soccer_epl")}
    # 1X2 vient de Pinnacle (référence)
    assert odds["WIN_HOME"].cote == 1.90 and odds["WIN_HOME"].bookmaker == "pinnacle"
    # plus/moins 2,5 récupéré chez bwin — plus de repli
    assert odds["OVER_2_5"].cote == 1.90 and odds["OVER_2_5"].bookmaker == "bwin"
    assert odds["UNDER_2_5"].cote == 1.95 and odds["UNDER_2_5"].bookmaker == "bwin"
    # la ligne 2,75 de Pinnacle n'est jamais émise
    assert set(odds) == {"WIN_HOME", "WIN_AWAY", "DRAW", "OVER_2_5", "UNDER_2_5"}


def test_parse_odds_pinnacle_2_5_preferred_over_tighter_soft_book():
    # Pinnacle a le 2,5 : on le prend même si un soft book est nominalement plus serré.
    ev = [{
        "id": "evt3", "commence_time": "2026-08-15T14:00:00Z",
        "home_team": "A", "away_team": "B",
        "bookmakers": [
            {"key": "softbook", "markets": [{"key": "totals", "outcomes": [
                {"name": "Over", "price": 1.98, "point": 2.5},
                {"name": "Under", "price": 1.98, "point": 2.5}]}]},
            {"key": "pinnacle", "markets": [
                {"key": "h2h", "outcomes": [
                    {"name": "A", "price": 2.0}, {"name": "B", "price": 3.9}, {"name": "Draw", "price": 3.5}]},
                {"key": "totals", "outcomes": [
                    {"name": "Over", "price": 1.93, "point": 2.5},
                    {"name": "Under", "price": 1.90, "point": 2.5}]}]},
        ],
    }]
    odds = {o.marche: o for o in parse_odds(ev, "soccer_epl")}
    assert odds["OVER_2_5"].bookmaker == "pinnacle" and odds["OVER_2_5"].cote == 1.93


def test_parse_odds_totals_picks_tightest_when_no_pinnacle():
    # Sans Pinnacle : on prend le book EU de marge OU la plus faible.
    ev = [{
        "id": "evt4", "commence_time": "2026-08-15T14:00:00Z",
        "home_team": "A", "away_team": "B",
        "bookmakers": [
            {"key": "gassy", "markets": [{"key": "h2h", "outcomes": [
                {"name": "A", "price": 2.0}, {"name": "B", "price": 3.9}, {"name": "Draw", "price": 3.5}]},
                {"key": "totals", "outcomes": [
                    {"name": "Over", "price": 1.83, "point": 2.5},
                    {"name": "Under", "price": 1.83, "point": 2.5}]}]},   # marge ~9,3 %
            {"key": "sharp", "markets": [{"key": "totals", "outcomes": [
                {"name": "Over", "price": 1.95, "point": 2.5},
                {"name": "Under", "price": 1.95, "point": 2.5}]}]},        # marge ~2,6 %
        ],
    }]
    odds = {o.marche: o for o in parse_odds(ev, "soccer_epl")}
    # 1X2 : premier book EU (gassy) faute de Pinnacle ; totals : le plus serré (sharp)
    assert odds["WIN_HOME"].bookmaker == "gassy"
    assert odds["OVER_2_5"].bookmaker == "sharp"


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


# --- Hystérésis de la bascule cote ↔ modèle -------------------------------
from mtj_model.pipeline.source_mode import next_mode  # noqa: E402


def test_hysteresis_switch_to_model_above_10pct():
    d = next_mode("odds", 0.18)   # Grèce à 18 %
    assert d.mode == "model" and d.changed


def test_hysteresis_stays_between_8_and_10():
    # 9 % : au-dessus de 8, en dessous de 10 → aucune bascule dans un sens ou l'autre
    assert next_mode("odds", 0.09).mode == "odds"
    assert next_mode("model", 0.09).mode == "model"
    assert not next_mode("odds", 0.09).changed


def test_hysteresis_returns_to_odds_below_8pct():
    d = next_mode("model", 0.07)
    assert d.mode == "odds" and d.changed


def test_hysteresis_no_switch_without_data():
    assert not next_mode("model", None).changed


def test_upsert_fixture_updates_orientation_on_conflict():
    """DÉGEL : l'upsert doit RÉ-ÉCRIRE team_home_id / team_away_id sur conflit, pas les
    geler. C'est le correctif du fixture inversé (« le PSG affiché perdant ») : le
    fournisseur corrige parfois l'orientation d'un relevé à l'autre, on doit le suivre."""
    from mtj_model.pipeline.sync import upsert_fixture

    captured = {}

    class _Cur:
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def execute(self, sql, params):
            captured["sql"] = sql
        def fetchone(self):
            return (42,)

    class _Con:
        def cursor(self):
            return _Cur()

    fid = upsert_fixture(
        _Con(), provider_ref="ev1", league_id=1, home_id=7, away_id=9,
        date_utc=pd.Timestamp("2026-08-23T18:45:00Z"), status="scheduled",
    )
    assert fid == 42
    sql = " ".join(captured["sql"].split()).lower()
    # Les DEUX colonnes d'orientation sont dans le DO UPDATE SET (plus seulement à l'insert).
    assert "team_home_id = excluded.team_home_id" in sql
    assert "team_away_id = excluded.team_away_id" in sql
