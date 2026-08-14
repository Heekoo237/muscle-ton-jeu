"""Garde-fou co-occurrence, version SOURCE UNIQUE (feed de cotes).

Indépendant de football-data : il tient donc en régime « cote seule », où les
deux tests football-data (checkmap) sont dormants faute d'historique à
réconcilier. Deux adversaires d'un même match ne doivent jamais partager une clé
canonique — sinon on écrirait un match `home == away` par fusion silencieuse.
"""
from __future__ import annotations

import pytest

from mtj_model.pipeline.sync import (
    TeamMergeCollision,
    assert_distinct_opponents,
    canonical_key,
)


def test_opponents_distincts_passent():
    # Deux vrais clubs différents : aucune collision.
    assert_distinct_opponents("Paris FC", "Paris SG")
    assert_distinct_opponents("Club Brugge", "Cercle Brugge")
    assert_distinct_opponents("Inter Milan", "AC Milan")


def test_meme_club_leve():
    # Même club des deux côtés (bug de feed) → refus explicite.
    with pytest.raises(TeamMergeCollision):
        assert_distinct_opponents("Arsenal", "Arsenal FC")  # « fc » = bruit → même clé


def test_clubs_distincts_ne_partagent_pas_la_cle():
    # Le socle du garde-fou : la clé canonique sépare bien ces paires piégeuses.
    assert canonical_key("Paris FC") != canonical_key("Paris SG")
    assert canonical_key("Club Brugge") != canonical_key("Cercle Brugge")
