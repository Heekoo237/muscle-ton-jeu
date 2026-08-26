"""Alerte catalogue : nouvelle compétition féminine/sélection à vérifier."""
from mtj_model.pipeline.catalogue_sync import competitions_a_verifier


def test_flague_feminin_et_selection():
    inserts = ["soccer_spain_primera_division_women", "soccer_uefa_nations_league",
               "soccer_germany_frauen_bundesliga", "soccer_england_league1", "soccer_italy_serie_a"]
    out = competitions_a_verifier(inserts, {})
    assert "soccer_spain_primera_division_women" in out
    assert "soccer_uefa_nations_league" in out
    assert "soccer_germany_frauen_bundesliga" in out
    assert "soccer_england_league1" not in out
    assert "soccer_italy_serie_a" not in out


def test_detecte_par_le_titre_aussi():
    # La clé ne dit pas « women » mais le titre si.
    out = competitions_a_verifier(["soccer_x_superleague"], {"soccer_x_superleague": "X Women's Super League"})
    assert out == ["soccer_x_superleague"]


def test_aucune_nouvelle_sensible():
    assert competitions_a_verifier(["soccer_france_ligue_two"], {}) == []
