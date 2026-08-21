"""Alerte de REFUS d'analyse — au-delà de 30 % de refus de lecture sur la journée,
health alerte. C'est l'échec qu'on ne voit jamais : un utilisateur refusé à la
porte ne se plaint pas. Sous garde-fou d'échantillon (20 tentatives)."""
from mtj_model.constants import REFUS_MIN_TENTATIVES
from mtj_model.pipeline.health import vision_refus_alert


def test_alerte_au_dela_de_30_pct_avec_echantillon():
    # 40 tentatives, 16 refus de contenu → 40 % > 30 %, échantillon suffisant.
    msg = vision_refus_alert(40, 16)
    assert msg is not None
    assert "40%" in msg
    assert "porte" in msg.lower()


def test_pas_d_alerte_sous_le_seuil():
    assert vision_refus_alert(100, 25) is None  # 25 % < 30 %


def test_pas_d_alerte_echantillon_trop_mince():
    # Même à 100 % de refus, trop peu de tentatives → on ne crie pas.
    assert vision_refus_alert(REFUS_MIN_TENTATIVES - 1, REFUS_MIN_TENTATIVES - 1) is None


def test_zero_tentative_pas_de_division():
    assert vision_refus_alert(0, 0) is None
