"""Garde-fou de palier : on ne lance jamais un plan qui dépasse le palier détecté.

Le cas réel qui a motivé ce test : un plan de 5 700 crédits/mois sur un palier
gratuit à 500. Le collecteur doit le voir et s'arrêter, pas le découvrir à mi-mois.
"""
from mtj_model.pipeline.quota import check_quota, planned_monthly_credits
from mtj_model.pipeline.sync import slots_for


def _wl(n_modele: int, n_cote: int) -> list[dict]:
    return (
        [{"releves_par_jour": 4} for _ in range(n_modele)]
        + [{"releves_par_jour": 1} for _ in range(n_cote)]
    )


def test_plan_frequence_graduee():
    # 11 modèle (4/j) + 34 cote (1/j), 2 marchés : 11*4*30*2 + 34*1*30*2 = 2640 + 2040.
    assert planned_monthly_credits(_wl(11, 34)) == 2640 + 2040


def test_palier_gratuit_refuse_le_plan():
    # 500 gratuit vs plan 5 700 : le garde-fou refuse.
    ok, msg = check_quota(quota=500, remaining=268, planned=5700)
    assert ok is False
    assert "QUOTA INSUFFISANT" in msg


def test_palier_paye_accepte_le_plan():
    ok, msg = check_quota(quota=20_000, remaining=19_000, planned=5700)
    assert ok is True


def test_palier_inconnu_ne_bloque_pas_mais_le_dit():
    ok, msg = check_quota(quota=None, remaining=None, planned=5700)
    assert ok is True
    assert "palier inconnu" in msg


def test_slots_frequence():
    assert slots_for(4) == {0, 6, 12, 18}   # modèle : chaque fenêtre
    assert slots_for(2) == {6, 18}
    assert slots_for(1) == {6}              # cote seule : une seule fenêtre/jour


def test_seuil_alerte_proportionnel_au_palier():
    from mtj_model.pipeline.health import credit_low_threshold
    # 20 % du palier détecté ; on prévient AVANT le blocage dur.
    assert credit_low_threshold(20_000) == 4000
    assert credit_low_threshold(500) == 150     # 20 % = 100, sous le plancher → plancher 150
    assert credit_low_threshold(None) == 150    # palier inconnu → plancher absolu
