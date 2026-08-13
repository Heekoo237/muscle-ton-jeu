"""Invariants du modèle : la grille de score et les marchés sont cohérents."""
import numpy as np

from mtj_model.markets import market_probabilities
from mtj_model.poisson import score_matrix


def test_matrix_sums_to_one():
    m = score_matrix(1.6, 1.1, rho=-0.05)
    assert abs(m.sum() - 1.0) < 1e-9


def test_matrix_non_negative():
    m = score_matrix(2.0, 0.4, rho=-0.15)
    assert (m >= 0).all()


def test_markets_are_probabilities():
    m = score_matrix(1.4, 1.2, rho=-0.03)
    p = market_probabilities(m)
    for v in p.values():
        assert -1e-9 <= v <= 1.0 + 1e-9


def test_market_complements():
    m = score_matrix(1.9, 1.3, rho=-0.07)
    p = market_probabilities(m)
    assert abs(p["WIN_HOME"] + p["DRAW"] + p["WIN_AWAY"] - 1.0) < 1e-9
    assert abs(p["OVER_2_5"] + p["UNDER_2_5"] - 1.0) < 1e-9
    assert abs(p["BTTS_YES"] + p["BTTS_NO"] - 1.0) < 1e-9
    assert abs(p["DC_HOME_DRAW"] - (p["WIN_HOME"] + p["DRAW"])) < 1e-12


def test_home_favoured_when_lambda_higher():
    p = market_probabilities(score_matrix(2.2, 0.8, rho=-0.05))
    assert p["WIN_HOME"] > p["WIN_AWAY"]


def test_dc_correction_shifts_low_scores():
    """La correction Dixon-Coles (ρ<0) augmente la masse du 0-0 vs Poisson pur."""
    plain = score_matrix(1.3, 1.1, rho=0.0)
    dc = score_matrix(1.3, 1.1, rho=-0.1)
    assert dc[0, 0] > plain[0, 0]
