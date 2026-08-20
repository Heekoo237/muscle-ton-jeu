"""Régime COTE SEULE : cote dé-vigée seule + double chance dérivée, rien de deviné.

Aucun modèle, aucun historique. La probabilité vient uniquement de la cote (calcul
déterministe). La double chance est arithmétique (P(1X)=P(1)+P(X)), tracée à part
(cote_derivee), confiance basse, barre de fragilité fixe.
"""
import pandas as pd

from mtj_model.constants import CONFIDENCE_VALUE, FRAGILE_THRESHOLD_COTE_SEULE_BY_MARKET
from mtj_model.pipeline.compute import league_predictions_cote_seule


def test_devig_1x2_et_ou_plus_dc_derivee():
    upcoming = pd.DataFrame([{"fixture_id": 1, "home": "A", "away": "B"}])
    odds = {1: {"WIN_HOME": 2.0, "DRAW": 3.5, "WIN_AWAY": 4.0, "OVER_2_5": 1.9, "UNDER_2_5": 1.9}}
    books = {1: {"WIN_HOME": "pinnacle", "OVER_2_5": "betclic"}}
    by = {r.marche: r for r in league_predictions_cote_seule(upcoming, "soccer_x", odds, books)}

    # 1X2 et plus/moins 2,5 : cote lue et dé-vigée → source cote_seule.
    for m in ("WIN_HOME", "DRAW", "WIN_AWAY", "OVER_2_5", "UNDER_2_5"):
        assert by[m].source == "cote_seule"
    # Double chance : dérivée arithmétiquement → source cote_derivee, DISTINCTE.
    for m in ("DC_HOME_DRAW", "DC_DRAW_AWAY", "DC_HOME_AWAY"):
        assert by[m].source == "cote_derivee"

    # 1X2 dé-vigé somme à 1 ; DC = somme des deux issues.
    assert abs(sum(by[m].probabilite for m in ("WIN_HOME", "DRAW", "WIN_AWAY")) - 1.0) < 1e-3
    assert abs(by["DC_HOME_DRAW"].probabilite - (by["WIN_HOME"].probabilite + by["DRAW"].probabilite)) < 1e-6

    # Confiance BASSE toujours, barre de retrait DIFFÉRENCIÉE PAR ISSUE (échelle de
    # la cote, pas une calibration) : un nul et un favori n'ont plus le même seuil.
    assert by["WIN_HOME"].confiance == CONFIDENCE_VALUE["faible"]
    assert by["WIN_HOME"].seuil_fragile == FRAGILE_THRESHOLD_COTE_SEULE_BY_MARKET["WIN_HOME"]
    assert by["DRAW"].seuil_fragile == FRAGILE_THRESHOLD_COTE_SEULE_BY_MARKET["DRAW"]
    assert by["DRAW"].seuil_fragile < by["WIN_HOME"].seuil_fragile  # le nul, plus bas
    assert by["DC_HOME_DRAW"].seuil_fragile == FRAGILE_THRESHOLD_COTE_SEULE_BY_MARKET["DC_HOME_DRAW"]
    # Le book porte la cote lue, jamais la dérivée.
    assert by["WIN_HOME"].bookmaker == "pinnacle"
    assert by["DC_HOME_DRAW"].bookmaker is None


def test_1x2_absent_pas_de_double_chance():
    # Sans 1X2, pas de DC dérivée — on ne devine rien (règle d'or n°3).
    upcoming = pd.DataFrame([{"fixture_id": 2, "home": "A", "away": "B"}])
    odds = {2: {"OVER_2_5": 1.8, "UNDER_2_5": 2.0}}
    marches = {r.marche for r in league_predictions_cote_seule(upcoming, "soccer_x", odds, {})}
    assert marches == {"OVER_2_5", "UNDER_2_5"}


def test_aucune_cote_aucune_ligne():
    upcoming = pd.DataFrame([{"fixture_id": 3, "home": "A", "away": "B"}])
    assert league_predictions_cote_seule(upcoming, "soccer_x", {}, {}) == []
