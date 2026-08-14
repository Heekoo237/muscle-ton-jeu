"""Invariant des DEUX écrivains — collecteur et nocturne écrivent la MÊME valeur.

Le collecteur écrit les prédictions cote seule dans la foulée de la collecte ; le
nocturne les (ré)écrit la nuit. C'est acceptable UNIQUEMENT parce que, sur une même
entrée, les deux produisent une valeur identique. Ici on vérifie cet invariant au
lieu de le supposer.

La SEULE différence entre les deux chemins d'entrée est la forme du frame
`upcoming` : le nocturne le construit riche (home/away/date via `_fetch_upcoming`),
le collecteur minimal (fixture_id seul via `upcoming_frame`). Comme
`league_predictions_cote_seule` ne lit que `fixture_id`, les deux DOIVENT donner
exactement les mêmes lignes. Les cotes, elles, viennent de la même lecture
(`fetch_latest_odds`) des deux côtés — donc identiques par construction.
"""
import pandas as pd

from mtj_model.pipeline.compute import league_predictions_cote_seule
from mtj_model.pipeline.predictions_io import upcoming_frame


def _cle(rows):
    """Clé comparable et déterministe d'un lot de prédictions."""
    return sorted(
        (r.fixture_id, r.marche, r.probabilite, r.confiance, r.source, r.seuil_fragile, r.bookmaker)
        for r in rows
    )


def test_collecteur_et_nocturne_valeur_identique_cote_seule():
    fd = "soccer_x"
    odds = {
        1: {"WIN_HOME": 2.0, "DRAW": 3.5, "WIN_AWAY": 4.0, "OVER_2_5": 1.9, "UNDER_2_5": 1.9},
        2: {"WIN_HOME": 1.6, "DRAW": 4.0, "WIN_AWAY": 5.5},
    }
    books = {1: {"WIN_HOME": "pinnacle", "OVER_2_5": "betclic"}, 2: {}}

    # Chemin NOCTURNE : frame riche, tel que `_fetch_upcoming` le produit.
    frame_nocturne = pd.DataFrame([
        {"fixture_id": 1, "home": "A", "away": "B", "date_utc": "2026-01-01"},
        {"fixture_id": 2, "home": "C", "away": "D", "date_utc": "2026-01-02"},
    ])
    # Chemin COLLECTEUR : frame minimal, via l'utilitaire partagé.
    frame_collecteur = upcoming_frame([1, 2])

    rows_nocturne = league_predictions_cote_seule(frame_nocturne, fd, odds, books)
    rows_collecteur = league_predictions_cote_seule(frame_collecteur, fd, odds, books)

    # Garde-fou : l'invariant ne doit pas tenir « par le vide ».
    assert rows_nocturne, "aucune prédiction produite — l'invariant testerait du vide"
    # L'invariant : mêmes fixtures, mêmes marchés, mêmes probas, sources, seuils, books.
    assert _cle(rows_nocturne) == _cle(rows_collecteur)


def test_ordre_des_fixtures_sans_effet_sur_la_valeur():
    # L'ordre de collecte ne doit pas changer la valeur écrite (déterminisme).
    fd = "soccer_x"
    odds = {
        7: {"WIN_HOME": 2.2, "DRAW": 3.2, "WIN_AWAY": 3.4},
        9: {"WIN_HOME": 1.8, "DRAW": 3.6, "WIN_AWAY": 4.5},
    }
    a = league_predictions_cote_seule(upcoming_frame([7, 9]), fd, odds, {})
    b = league_predictions_cote_seule(upcoming_frame([9, 7]), fd, odds, {})
    assert _cle(a) == _cle(b)
