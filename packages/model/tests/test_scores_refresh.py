"""Rafraîchissement des scores : isolation par ligue + alerte de récurrence.

Le vrai coût était invisible : une ligue qui levait avortait TOUTE la boucle, et un
match terminé restait `scheduled` puis sortait de la fenêtre /scores → score perdu.
Deux garde-fous testés ici : (1) une nuit d'échec isolée n'alerte pas ; (2) une ligue
qui échoue de façon récurrente (≥ 2 des 3 dernières nuits) alerte.
"""
from mtj_model.pipeline.health import recurrent_score_failures, SCORES_ECHEC_MIN


def test_une_nuit_isolee_n_alerte_pas():
    # P1 n'a échoué qu'une seule des trois nuits → pas de récurrence.
    nights = [{"P1": "404"}, {}, {}]
    assert recurrent_score_failures(nights) == {}


def test_recurrence_detectee():
    # P1 échoue 2 nuits sur 3 → récurrent (≥ SCORES_ECHEC_MIN).
    nights = [{"P1": "404"}, {"P1": "timeout"}, {}]
    rec = recurrent_score_failures(nights)
    assert rec.get("P1") == SCORES_ECHEC_MIN


def test_plusieurs_ligues_seules_les_recurrentes():
    nights = [{"P1": "a", "SP1": "b"}, {"P1": "c"}, {"P1": "d"}]
    rec = recurrent_score_failures(nights)
    assert rec.get("P1") == 3  # 3 nuits
    assert "SP1" not in rec    # une seule nuit


def test_liste_vide():
    assert recurrent_score_failures([]) == {}
    assert recurrent_score_failures([{}, {}, {}]) == {}
