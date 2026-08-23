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
    assert "RETOURNÉ" in msg


def test_alerte_sur_un_un_sur_cinq():
    # 16 retournés (le cas réel) : doit crier, et donner le compte exact.
    msg = orientation_flip_alert(16)
    assert msg is not None and "16" in msg
