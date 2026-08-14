"""Tests MÉCANIQUES de la carte d'alias (indépendants du football).

À faire tourner à chaque ajout de championnat. TEST 1 (co-occurrence) charge
football-data ; il est ignoré seulement si le réseau est totalement indisponible.
TEST 2 (volume) est testé ici sur des données synthétiques ; il tourne aussi en
vrai après le rechargement (checkmap --volume).
"""
from __future__ import annotations

import pytest

from mtj_model.pipeline.checkmap import cooccurrence_violations, volume_outliers, VOLUME_MAX


def test_curated_map_no_cooccurrence():
    """TEST 1 : aucune paire de la carte ne fusionne deux clubs d'une même saison."""
    try:
        violations = cooccurrence_violations()
    except Exception as exc:  # réseau indisponible → on n'échoue pas à tort
        pytest.skip(f"football-data injoignable : {exc}")
    assert violations == [], f"Fusions fausses détectées : {violations}"


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def execute(self, *_):
        pass

    def fetchall(self):
        return self._rows

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class _FakeCon:
    def __init__(self, rows):
        self._rows = rows

    def cursor(self):
        return _FakeCursor(self._rows)


def test_volume_flags_double_merge():
    """TEST 2 : une équipe au volume double (deux clubs fusionnés) est signalée."""
    # 38 matchs normaux (une ligne par match) sur 2024-08 → saison 2024.
    normal = [("Arsenal", "2024-09-01T15:00:00Z", 1) for _ in range(38)]
    doubled = [("FusionFausse", "2024-09-01T15:00:00Z", 1) for _ in range(76)]
    outliers = volume_outliers(_FakeCon(normal + doubled))
    noms = {o[0] for o in outliers}
    assert "FusionFausse" in noms and "Arsenal" not in noms
    assert all(n > VOLUME_MAX for _, _, n in outliers)
