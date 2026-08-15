"""Alerte de variabilité vision — au-delà de 20 % de lectures incomplètes sur la
journée, health alerte. Sous garde-fou d'échantillon : pas d'alerte sur deux tickets.
"""
from mtj_model.constants import VISION_INCOMPLETE_MIN_LIGNES
from mtj_model.pipeline.health import vision_incomplete_alert


def test_alerte_au_dela_de_20_pct_avec_echantillon():
    # 100 lignes, 25 incomplètes → 25 % > 20 %, échantillon suffisant.
    msg = vision_incomplete_alert(100, 25)
    assert msg is not None
    assert "25%" in msg


def test_pas_d_alerte_sous_le_seuil():
    assert vision_incomplete_alert(100, 15) is None  # 15 % < 20 %


def test_pas_d_alerte_echantillon_trop_mince():
    # Même à 50 %, trop peu de lignes lues → on ne crie pas sur deux tickets.
    assert vision_incomplete_alert(VISION_INCOMPLETE_MIN_LIGNES - 1, 10) is None


def test_zero_ligne_pas_de_division():
    assert vision_incomplete_alert(0, 0) is None
