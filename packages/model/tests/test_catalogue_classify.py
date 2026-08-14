"""Le classement de régime d'une compétition est déterministe et sûr.

Une compétition backtestée est 'modele', une éligible football-data est 'eligible'
(à onboarder), tout le reste est 'cote_seule' — jamais deviné, jamais promu par
erreur. La cohérence avec constants.ODDS_API_KEYS est vérifiée ici.
"""
from mtj_model.constants import ODDS_API_KEYS
from mtj_model.pipeline.catalogue import MODEL_ELIGIBLE_FD, MODEL_LIVE, classify


def test_les_11_backtestees_sont_modele():
    for k in ODDS_API_KEYS.values():
        assert classify(k) == "modele"
    assert MODEL_LIVE == set(ODDS_API_KEYS.values())


def test_ligue_2_est_eligible_pas_modele():
    # Ligue 2 : football-data la price → onboardable, mais PAS encore backtestée.
    assert classify("soccer_france_ligue_two") == "eligible"
    assert "soccer_france_ligue_two" in MODEL_ELIGIBLE_FD


def test_inconnue_reste_cote_seule():
    # Une compétition qu'on ne connaît pas ne se promeut jamais toute seule.
    assert classify("soccer_uefa_champs_league_qualification") == "cote_seule"
    assert classify("soccer_conmebol_copa_libertadores") == "cote_seule"


def test_eligible_et_live_ne_se_recouvrent_pas():
    # Une clé ne peut pas être à la fois live et « à onboarder ».
    assert MODEL_LIVE.isdisjoint(MODEL_ELIGIBLE_FD.keys())
