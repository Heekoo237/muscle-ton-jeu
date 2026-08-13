"""Sources des données : 6 championnats × 3 saisons, football-data.co.uk.

Source CANONIQUE : football-data.co.uk (gratuit, résultats + cotes de clôture).
Dans cet environnement, l'accès à ce domaine est bloqué par la politique réseau ;
on récupère alors les MÊMES fichiers gratuits depuis un miroir GitHub public.
Le choix se fait par la variable d'environnement `MTJ_DATA_SOURCE` :

    MTJ_DATA_SOURCE=footballdata   # source officielle (production / réseau ouvert)
    MTJ_DATA_SOURCE=mirror         # miroir GitHub (défaut ici)

Changer de source est un one-liner : rien d'autre dans le pipeline n'en dépend.
"""
from __future__ import annotations

import os

# 6 championnats couverts (code football-data → nom, pays).
LEAGUES: dict[str, tuple[str, str]] = {
    "E0": ("Premier League", "Angleterre"),
    "F1": ("Ligue 1", "France"),
    "SP1": ("La Liga", "Espagne"),
    "I1": ("Serie A", "Italie"),
    "D1": ("Bundesliga", "Allemagne"),
    "P1": ("Liga Portugal", "Portugal"),
}

# 3 saisons complètes. Pour chaque code de saison football-data (ex. "2324") :
#   - le code officiel dans l'URL mmz4281
#   - le dossier correspondant dans le miroir (dataYYYY = saison DÉBUTANT en YYYY,
#     vérifié par les fenêtres de dates : data2022 = saison 2022-2023).
SEASONS: dict[str, dict[str, str]] = {
    "2223": {"label": "2022-2023", "fd": "2223", "mirror": "data2022"},
    "2324": {"label": "2023-2024", "fd": "2324", "mirror": "data2023"},
    "2425": {"label": "2024-2025", "fd": "2425", "mirror": "data2024"},
}

_FOOTBALLDATA_BASE = "https://www.football-data.co.uk/mmz4281"
_MIRROR_BASE = "https://raw.githubusercontent.com/LorEri2/StatsMax/main/CSV_Data"


def data_source() -> str:
    return os.environ.get("MTJ_DATA_SOURCE", "mirror").strip().lower()


def csv_url(div: str, season_code: str) -> str:
    """URL du CSV pour un championnat et une saison, selon la source active."""
    s = SEASONS[season_code]
    if data_source() == "footballdata":
        return f"{_FOOTBALLDATA_BASE}/{s['fd']}/{div}.csv"
    return f"{_MIRROR_BASE}/{s['mirror']}/{div}.csv"


def all_targets() -> list[tuple[str, str]]:
    """Toutes les paires (championnat, saison) à charger — 6 × 3 = 18."""
    return [(div, code) for code in SEASONS for div in LEAGUES]
