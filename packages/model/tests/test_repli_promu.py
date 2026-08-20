"""Repli COTE SEULE par match — un promu (équipe hors fit) reçoit une prédiction
cote seule, même dans un championnat MODÈLE. On n'a pas modélisé ce match, la source
et la confiance le DISENT (cote_seule, faible), et le rédacteur le traitera comme du
cote seule (aucun fait) — parce qu'il décide sur la SOURCE, pas sur la ligue.
"""
import itertools

import numpy as np
import pandas as pd

from mtj_model.constants import CONFIDENCE_VALUE, FRAGILE_THRESHOLD_COTE_SEULE_BY_MARKET
from mtj_model.pipeline.compute import league_predictions


def _history() -> pd.DataFrame:
    rng = np.random.default_rng(1)
    teams = [f"T{i}" for i in range(6)]
    rows, day = [], pd.Timestamp("2024-01-01")
    for _ in range(4):
        for h, a in itertools.permutations(teams, 2):
            rows.append({"home": h, "away": a, "fthg": int(rng.poisson(1.4)),
                         "ftag": int(rng.poisson(1.1)), "date": day})
            day += pd.Timedelta(days=1)
    return pd.DataFrame(rows)


def test_promu_replie_en_cote_seule_meme_en_ligue_modele():
    hist = _history()
    up = pd.DataFrame([
        {"fixture_id": 1, "home": "T0", "away": "T1"},     # connus → modèle
        {"fixture_id": 2, "home": "PROMU", "away": "T0"},  # promu → repli cote seule
    ])
    odds = {2: {"WIN_HOME": 2.0, "DRAW": 3.5, "WIN_AWAY": 4.0}}
    repli: list = []
    rows = league_predictions(hist, up, "E0", pd.Timestamp("2024-03-01"), odds, {}, repli_promu=repli)

    by_fid: dict = {}
    for r in rows:
        by_fid.setdefault(r.fixture_id, []).append(r)

    # Match connu : sources modèle (jamais cote_seule).
    assert 1 in by_fid and all(r.source != "cote_seule" for r in by_fid[1])
    # Promu : cote seule, confiance FAIBLE, seuil FIXE — l'aveu honnête.
    assert 2 in by_fid and by_fid[2]
    wh = next(r for r in by_fid[2] if r.marche == "WIN_HOME")
    assert wh.source == "cote_seule"
    assert wh.confiance == CONFIDENCE_VALUE["faible"]
    assert wh.seuil_fragile == FRAGILE_THRESHOLD_COTE_SEULE_BY_MARKET["WIN_HOME"]
    # Double chance dérivée présente (cote_derivee), et le repli est compté.
    assert any(r.source == "cote_derivee" for r in by_fid[2])
    assert repli == [2]


def test_promu_sans_cote_reste_inconnu():
    # Pas de cote pour le promu → on n'écrit RIEN (règle d'archi n°3), pas de repli.
    hist = _history()
    up = pd.DataFrame([{"fixture_id": 3, "home": "PROMU", "away": "T0"}])
    repli: list = []
    rows = league_predictions(hist, up, "E0", pd.Timestamp("2024-03-01"), {}, {}, repli_promu=repli)
    assert rows == []
    assert repli == []


def test_promu_cote_invalide_pas_de_repli():
    # Cote de promu aberrante (marge négative) → rejetée, aucun repli, aucune ligne.
    hist = _history()
    up = pd.DataFrame([{"fixture_id": 4, "home": "PROMU", "away": "T0"}])
    odds = {4: {"WIN_HOME": 5.0, "DRAW": 5.0, "WIN_AWAY": 5.0}}  # Σ prob = 0.6
    repli, invalides = [], []
    rows = league_predictions(hist, up, "E0", pd.Timestamp("2024-03-01"), odds, {},
                              repli_promu=repli, invalides=invalides)
    assert rows == []
    assert repli == []
    assert any(i["raison"] == "marge_negative" for i in invalides)
