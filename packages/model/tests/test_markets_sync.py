"""Invariant : la liste des marchés couverts reste synchronisée entre les couches.

Le modèle (Python), le schéma SQL (enum `market`) et le type TS (`Market`)
doivent lister exactement les 14 mêmes marchés couverts. Ce test échoue si l'un
d'eux dérive.
"""
from mtj_model.markets import COVERED_MARKETS

EXPECTED = {
    "WIN_HOME", "DRAW", "WIN_AWAY",
    "DC_HOME_DRAW", "DC_DRAW_AWAY", "DC_HOME_AWAY",
    "OVER_1_5", "UNDER_1_5", "OVER_2_5", "UNDER_2_5", "OVER_3_5", "UNDER_3_5",
    "BTTS_YES", "BTTS_NO",
}


def test_covered_markets_count():
    assert len(COVERED_MARKETS) == 14


def test_covered_markets_match_contract():
    assert set(COVERED_MARKETS) == EXPECTED
