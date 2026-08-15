"""Cotes aberrantes — un match invalide fait sauter CE match, jamais le nocturne.

Reproduit le crash `brentq` (« f(a) et f(b) de même signe ») : une marge NÉGATIVE
(Σ des probabilités implicites < 1) n'est pas dévigeable. Avant, elle plantait tout
le run ; désormais elle est rejetée, journalisée et comptée, et le calcul continue.
"""
import pandas as pd

from mtj_model.pipeline.compute import (
    devig_fixture_odds,
    devig_fixture_odds_report,
    league_predictions_cote_seule,
    valid_odds_group,
)
from mtj_model.pipeline.nightly import coverage_report


def test_marge_negative_ne_plante_pas_et_est_rapportee():
    # Σ prob implicites = 3 × (1/5) = 0.6 < 1 : marge négative, indévigeable.
    raw = {"WIN_HOME": 5.0, "DRAW": 5.0, "WIN_AWAY": 5.0}
    probs, invalides = devig_fixture_odds_report(raw)
    assert probs == {}  # rien dévigé pour ce groupe
    assert any(i["raison"] == "marge_negative" for i in invalides)
    assert devig_fixture_odds(raw) == {}  # l'ancien point d'entrée ne lève plus


def test_cote_sous_1_rejetee():
    raw = {"OVER_2_5": 1.0, "UNDER_2_5": 3.0}  # une cote à 1.00 = impossible
    probs, invalides = devig_fixture_odds_report(raw)
    assert "OVER_2_5" not in probs and "UNDER_2_5" not in probs
    assert any(i["raison"] == "cote_sous_1" for i in invalides)


def test_groupe_entierement_absent_est_silencieux():
    # Aucune cote collectée : marché non relevé, PAS une cote invalide.
    probs, invalides = devig_fixture_odds_report({})
    assert probs == {} and invalides == []


def test_groupe_valide_devige_normalement():
    raw = {"WIN_HOME": 2.0, "DRAW": 3.5, "WIN_AWAY": 4.0}
    probs, invalides = devig_fixture_odds_report(raw)
    assert invalides == []
    assert abs(sum(probs.values()) - 1.0) < 1e-6


def test_valid_odds_group_raisons():
    assert valid_odds_group([2.0, 3.5, 4.0])[0] is True
    assert valid_odds_group([None, 3.5])[1] == "cote_manquante"
    assert valid_odds_group([1.0, 3.0])[1] == "cote_sous_1"
    assert valid_odds_group([5.0, 5.0, 5.0])[1] == "marge_negative"


def test_un_match_invalide_ne_tue_pas_le_lot():
    up = pd.DataFrame([{"fixture_id": 1}, {"fixture_id": 2}])
    odds = {
        1: {"WIN_HOME": 5.0, "DRAW": 5.0, "WIN_AWAY": 5.0},  # marge négative
        2: {"WIN_HOME": 2.0, "DRAW": 3.5, "WIN_AWAY": 4.0},  # sain
    }
    sink: list = []
    rows = league_predictions_cote_seule(up, "soccer_x", odds, {}, invalides=sink)
    fids = {r.fixture_id for r in rows}
    assert 2 in fids and 1 not in fids  # le sain passe, l'aberrant est écarté
    assert any(i["fixture_id"] == 1 and i["raison"] == "marge_negative" for i in sink)


def test_coverage_marque_la_cote_invalide():
    groups = [{"fd": "soccer_x", "regime": "cote_seule", "fenetre": 3,
               "traites": 1, "hist_thin": False, "cotes_invalides": 2}]
    couverture, _, resume = coverage_report([], groups)
    assert couverture["soccer_x"]["raison"] == "cote_invalide"
    assert resume["cotes_invalides"] == 2
