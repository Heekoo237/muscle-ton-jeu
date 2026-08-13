"""Sources des données : championnats × saisons, football-data.co.uk.

Tout est piloté par la CONFIGURATION (`config/leagues.toml`) : ajouter un
championnat ou une saison est une ligne de config, pas du code.

Source CANONIQUE : football-data.co.uk (gratuit, résultats + cotes de clôture).
Dans cet environnement, l'accès à ce domaine est bloqué par la politique réseau ;
on récupère alors les MÊMES fichiers gratuits depuis un miroir GitHub public.
Le choix se fait par la variable d'environnement `MTJ_DATA_SOURCE` :

    MTJ_DATA_SOURCE=footballdata   # source officielle (production / réseau ouvert)
    MTJ_DATA_SOURCE=mirror         # miroir GitHub (défaut ici, dépannage réseau)

⚠️ Le miroir est un DÉPANNAGE, pas une dépendance de production (voir README).
"""
from __future__ import annotations

import os
import tomllib
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[2]  # packages/model
CONFIG_PATH = Path(os.environ.get("MTJ_LEAGUES_CONFIG", PKG_ROOT / "config" / "leagues.toml"))

_FOOTBALLDATA_BASE = "https://www.football-data.co.uk/mmz4281"
_MIRROR_BASE = "https://raw.githubusercontent.com/LorEri2/StatsMax/main/CSV_Data"


def _load_config() -> tuple[dict[str, tuple[str, str]], dict[str, dict[str, str]]]:
    with open(CONFIG_PATH, "rb") as f:
        cfg = tomllib.load(f)
    leagues = {code: (v[0], v[1]) for code, v in cfg["leagues"].items()}
    seasons = {s["code"]: {"label": s["label"], "fd": s["fd"], "mirror": s["mirror"]} for s in cfg["seasons"]}
    return leagues, seasons


LEAGUES, SEASONS = _load_config()


def data_source() -> str:
    return os.environ.get("MTJ_DATA_SOURCE", "mirror").strip().lower()


def csv_url(div: str, season_code: str) -> str:
    """URL du CSV pour un championnat et une saison, selon la source active."""
    s = SEASONS[season_code]
    if data_source() == "footballdata":
        return f"{_FOOTBALLDATA_BASE}/{s['fd']}/{div}.csv"
    return f"{_MIRROR_BASE}/{s['mirror']}/{div}.csv"


def all_targets() -> list[tuple[str, str]]:
    """Toutes les paires (championnat, saison) à charger."""
    return [(div, code) for code in SEASONS for div in LEAGUES]
