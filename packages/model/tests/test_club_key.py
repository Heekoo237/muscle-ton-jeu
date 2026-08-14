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
