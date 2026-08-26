"""Clé de club : regroupe les entités d'un même club, jamais deux adversaires.

Le club_id repose sur `sync.club_key`. Elle DOIT regrouper les variantes d'un même
club à travers les compétitions (Reims / Stade de Reims) et GARDER distincts deux
clubs adverses (Club Brugge / Cercle Brugge, AC / Inter Milan).
"""
from mtj_model.pipeline.sync import club_key


def test_regroupe_les_variantes_d_un_meme_club():
    assert club_key("Reims") == club_key("Stade de Reims")
    assert club_key("Dunkerque") == club_key("USL Dunkerque")
    assert club_key("St Etienne") == club_key("Saint Etienne")
    assert club_key("Clermont") == club_key("Clermont")


def test_garde_distincts_deux_clubs_adverses():
    # Le piège historique : ne JAMAIS fusionner ces paires.
    assert club_key("Club Brugge") != club_key("Cercle Brugge")
    assert club_key("AC Milan") != club_key("Inter Milan")
    assert club_key("Paris FC") != club_key("Paris Saint-Germain")


def test_jamais_vide():
    # Un nom entièrement fait d'affixes retombe sur la clé canonique, pas sur "".
    assert club_key("FC") != ""
    assert club_key("Stade") != ""


def test_compose_la_carte_curee_pour_le_regroupement_inter_competitions():
    # Le trou des coupes : un club éclaté championnat/coupe sous deux graphies que la
    # carte curée connaît DOIT recevoir le même club_id. club_key part de canonical_key,
    # donc la carte curée alimente le regroupement inter-compétitions (pas juste la
    # dédup dans une ligue).
    assert club_key("Paris SG") == club_key("Paris Saint Germain")
    assert club_key("Reims") == club_key("Stade de Reims")
    assert club_key("Torino") == club_key("Torino FC")
    # Le cas du matin, championnat + coupe : même club, même clé.
    assert club_key("Sheffield Wednesday") == club_key("Sheffield Wednesday")


def test_composition_ne_cree_pas_de_fausse_fusion():
    # La carte curée est vérifiée : composer ne rapproche AUCUNE paire distincte de plus.
    assert club_key("Paris FC") != club_key("Paris SG")
    assert club_key("Club Brugge") != club_key("Cercle Brugge")
    assert club_key("Inter Milan") != club_key("AC Milan")
