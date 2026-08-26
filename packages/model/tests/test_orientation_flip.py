"""Alerte surveillance : fixture retourné (« favori affiché perdant »).

La double chance MODÈLE (orientée par le fixture) et le 1X2 CoTÉ (orienté par le
fournisseur) qui désignent des favoris opposés = fixture home/away à l'envers.
On vérifie le SEUIL de l'alerte (logique pure, sans base)."""
from mtj_model.pipeline.health import orientation_flip_alert, FLIP_ALERT_MIN


def test_pas_alerte_sous_le_seuil():
    assert orientation_flip_alert(0) is None
    assert orientation_flip_alert(FLIP_ALERT_MIN - 1) is None


def test_alerte_des_le_seuil_et_cite_le_nombre():
    msg = orientation_flip_alert(FLIP_ALERT_MIN)
    assert msg is not None
    assert str(FLIP_ALERT_MIN) in msg
    assert "retourné" in msg


def test_alerte_cite_le_compte_des_actifs():
    # 5 RÉELLEMENT retournés (actifs) : doit crier, et donner le compte exact.
    msg = orientation_flip_alert(5)
    assert msg is not None and "5" in msg


def test_alerte_dit_actif_pas_perime():
    # L'alerte doit dire que ce sont des inversions RÉELLES, pas une DC périmée :
    # c'est toute la distinction qui a coûté deux jours.
    msg = orientation_flip_alert(FLIP_ALERT_MIN)
    assert "RÉELLEMENT" in msg
    assert "périmée" in msg  # « Ce n'est pas une DC périmée. »
