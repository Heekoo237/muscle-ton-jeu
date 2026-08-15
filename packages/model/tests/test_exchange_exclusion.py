"""Exclusion des ÉCHANGES de paris. Un carnet d'ordres n'est pas un book coté avec
marge — notre dévigage est calibré sur des books classiques. On ne retient jamais un
exchange comme source : mieux vaut pas de cote (repli modèle) qu'une cote de carnet.
"""
from mtj_model.pipeline.provider import (
    _is_exchange,
    _pick_bookmaker,
    _pick_totals_book,
    parse_odds,
)


def test_is_exchange_detecte_les_variantes():
    assert _is_exchange("betfair_ex_eu")
    assert _is_exchange("betfair_ex_uk")
    assert _is_exchange("matchbook")
    assert _is_exchange("smarkets")
    assert not _is_exchange("pinnacle")
    assert not _is_exchange("williamhill")
    assert not _is_exchange(None)


def test_pick_bookmaker_prefere_pinnacle_puis_classique():
    assert _pick_bookmaker([{"key": "betfair_ex_eu"}, {"key": "pinnacle"}])["key"] == "pinnacle"
    assert _pick_bookmaker([{"key": "betfair_ex_eu"}, {"key": "williamhill"}])["key"] == "williamhill"


def test_pick_bookmaker_que_exchange_renvoie_none():
    # Aucun book classique → None (pas de cote, jamais une cote d'exchange).
    assert _pick_bookmaker([{"key": "betfair_ex_eu"}, {"key": "matchbook"}]) is None


def test_pick_totals_book_ignore_exchange():
    ex = {"key": "betfair_ex_eu", "markets": [{"key": "totals", "outcomes": [
        {"name": "Over", "point": 2.5, "price": 1.05},
        {"name": "Under", "point": 2.5, "price": 1.05}]}]}
    classic = {"key": "williamhill", "markets": [{"key": "totals", "outcomes": [
        {"name": "Over", "point": 2.5, "price": 1.9},
        {"name": "Under", "point": 2.5, "price": 1.9}]}]}
    assert _pick_totals_book([ex, classic])["key"] == "williamhill"
    assert _pick_totals_book([ex]) is None


def test_parse_odds_ecarte_un_evenement_seulement_exchange():
    events = [{
        "id": "x", "home_team": "A", "away_team": "B",
        "commence_time": "2026-01-01T00:00:00Z",
        "bookmakers": [{"key": "betfair_ex_eu", "markets": [{"key": "h2h", "outcomes": [
            {"name": "A", "price": 1.09}, {"name": "Draw", "price": 1.02},
            {"name": "B", "price": 1.04}]}]}],
    }]
    # Seul book = exchange → aucune cote retenue (ni 1X2 ni totals).
    assert parse_odds(events, "soccer_x") == []
