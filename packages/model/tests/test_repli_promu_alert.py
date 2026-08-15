"""Alerte repli promu — un championnat MODÈLE qui dépasse 40 % de repli sur un mois
glissant doit se voir. Mais pas au jour 2 : garde-fous d'échantillon (runs + matchs).
"""
from mtj_model.constants import REPLI_PROMU_MIN_RUNS
from mtj_model.pipeline.health import repli_promu_offenders


def _run(fd, fenetre, repli, regime="modele"):
    return {fd: {"regime": regime, "fenetre": fenetre, "repli_promu": repli}}


def test_alerte_au_dela_du_seuil_avec_echantillon_suffisant():
    # 6 nocturnes, 20 matchs chacun, 10 en repli → 50 % > 40 %, échantillon large.
    couvertures = [_run("SP1", 20, 10) for _ in range(6)]
    chauds = repli_promu_offenders(couvertures)
    assert len(chauds) == 1
    assert chauds[0]["fd"] == "SP1"
    assert chauds[0]["taux"] == 0.5


def test_pas_d_alerte_echantillon_trop_mince():
    # Un seul run, même à 50 % : trop peu de runs → on ne crie pas au jour 2.
    couvertures = [_run("SP1", 20, 10)]
    assert repli_promu_offenders(couvertures) == []


def test_pas_d_alerte_sous_le_seuil():
    # 6 runs, 20 matchs, 6 en repli → 30 % < 40 %.
    couvertures = [_run("E0", 20, 6) for _ in range(REPLI_PROMU_MIN_RUNS + 1)]
    assert repli_promu_offenders(couvertures) == []


def test_ligue_cote_seule_ignoree():
    # Le repli ne concerne que le régime modèle ; une ligue cote seule est hors sujet.
    couvertures = [_run("soccer_x", 20, 20, regime="cote_seule") for _ in range(6)]
    assert repli_promu_offenders(couvertures) == []


def test_presaison_zero_fenetre_ignoree():
    # Ligue à 0 match en fenêtre (pré-saison) : aucune observation, pas d'alerte.
    couvertures = [_run("F1", 0, 0) for _ in range(6)]
    assert repli_promu_offenders(couvertures) == []
