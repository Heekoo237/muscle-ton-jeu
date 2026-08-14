"""Couverture du nocturne — un statut vert doit MESURER la couverture, pas juste
« pas planté ». Ces tests fixent la sémantique success/partial et les raisons, pour
qu'un run qui ignore des ligues ne puisse plus se déclarer réussi en silence.
"""
from mtj_model.pipeline.nightly import NIGHTLY_SKIP_ALERT, coverage_report


def test_ligue_en_fenetre_sans_ligne_degrade_le_run():
    # E0 a des matchs en fenêtre mais 0 traité → ABANDON → run dégradé.
    groups = [
        {"fd": "E0", "regime": "modele", "fenetre": 8, "traites": 0, "hist_thin": False},
        {"fd": "SP1", "regime": "modele", "fenetre": 6, "traites": 6, "hist_thin": False},
    ]
    couverture, degrade, resume = coverage_report(["E0", "SP1"], groups)
    assert degrade is True
    assert resume["abandons"] == ["E0"]
    assert couverture["E0"]["raison"] == "equipe_inconnue"


def test_presaison_zero_match_reste_success():
    # F1 attendue mais 0 match en fenêtre (pré-saison) : BÉNIN, run non dégradé.
    groups = [{"fd": "N1", "regime": "modele", "fenetre": 7, "traites": 7, "hist_thin": False}]
    couverture, degrade, resume = coverage_report(["N1", "F1"], groups)
    assert degrade is False
    assert couverture["F1"]["raison"] == "aucun_match_fenetre"
    assert couverture["F1"]["fenetre"] == 0
    assert resume["abandons"] == []


def test_historique_insuffisant_nomme_la_raison():
    # Ligue modèle dont le fit n'a pas pu s'ajuster → raison explicite, et abandon.
    groups = [{"fd": "G1", "regime": "modele", "fenetre": 5, "traites": 0, "hist_thin": True}]
    couverture, degrade, _ = coverage_report(["G1"], groups)
    assert couverture["G1"]["raison"] == "historique_insuffisant"
    assert degrade is True


def test_taux_de_saut_eleve_degrade_meme_sans_abandon_total():
    # Aucune ligue à 0, mais trop de matchs sautés au global → dégradé quand même.
    n = int(100 * NIGHTLY_SKIP_ALERT) + 5  # sautés au-dessus du seuil
    groups = [{"fd": "P1", "regime": "modele", "fenetre": 100, "traites": 100 - n, "hist_thin": False}]
    _, degrade, resume = coverage_report(["P1"], groups)
    assert resume["abandons"] == []
    assert resume["taux_saut"] > NIGHTLY_SKIP_ALERT
    assert degrade is True


def test_cote_seule_sans_cote_nomme_sa_raison():
    groups = [{"fd": "soccer_x", "regime": "cote_seule", "fenetre": 4, "traites": 1, "hist_thin": False}]
    couverture, _, _ = coverage_report([], groups)
    assert couverture["soccer_x"]["raison"] == "cote_absente"


def test_couverture_complete_est_success():
    groups = [{"fd": "SP1", "regime": "modele", "fenetre": 6, "traites": 6, "hist_thin": False}]
    couverture, degrade, resume = coverage_report(["SP1"], groups)
    assert degrade is False
    assert couverture["SP1"]["raison"] is None
    assert resume["taux_saut"] == 0.0
