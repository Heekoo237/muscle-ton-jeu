"""Génère le cache de prédictions walk-forward (base des étapes 3 et 4).

Rejoue la dernière saison journée par journée au ξ retenu, et écrit une table
par match : probabilités du MODÈLE (1X2 et plus/moins 2,5) + cotes de clôture du
marché. Tout le reste (dé-margeage, poids de fusion, calibration, Brier) se
calcule ensuite sur ce cache, instantanément.

    python -m mtj_model.backtest.generate
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from ..constants import XI_PER_DAY
from ..markets import market_probabilities
from ..poisson import score_matrix
from ..strength import fit_league

PKG_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PKG_ROOT / "data" / "mtj_stats.db"
CACHE_PATH = PKG_ROOT / "data" / "predictions_2425.csv"
EVAL_SEASON = "2425"
GRID = 11

ODDS_COLS = [
    # ouverture (existe au calcul nocturne) — 1X2 et plus/moins 2,5
    "open_avg_h", "open_avg_d", "open_avg_a",
    "open_ps_h", "open_ps_d", "open_ps_a",
    "open_avg_o25", "open_avg_u25",
    "open_ps_o25", "open_ps_u25",
    # clôture (information « du futur », pour l'analyse du mouvement)
    "close_avg_h", "close_avg_d", "close_avg_a",
    "close_ps_h", "close_ps_d", "close_ps_a",
    "close_avg_o25", "close_avg_u25",
    "close_ps_o25", "close_ps_u25",
]


def _load() -> dict[str, pd.DataFrame]:
    con = sqlite3.connect(DB_PATH)
    cols = "league_code,league_name,season_code,date,home,away,fthg,ftag,ftr," + ",".join(ODDS_COLS)
    df = pd.read_sql(f"select {cols} from matches", con, parse_dates=["date"])
    con.close()
    return {lg: g.sort_values("date").reset_index(drop=True) for lg, g in df.groupby("league_code")}




def generate() -> pd.DataFrame:
    leagues = _load()
    rows = []
    for g in leagues.values():
        eval_df = g[g["season_code"] == EVAL_SEASON]
        start = None
        for _, wk in eval_df.groupby(eval_df["date"].dt.to_period("W")):
            cutoff = wk["date"].min()
            hist = g[g["date"] < cutoff]
            if hist["home"].nunique() < 4:
                continue
            fit = fit_league(hist, cutoff, XI_PER_DAY, start=start)
            start = fit.params
            for _, m in wk.iterrows():
                eg = fit.expected_goals(m["home"], m["away"])
                if eg is None:
                    continue
                mk = market_probabilities(score_matrix(eg[0], eg[1], fit.rho, size=GRID))
                rows.append({
                    "league_code": m["league_code"], "league_name": m["league_name"],
                    "date": m["date"].date().isoformat(), "home": m["home"], "away": m["away"],
                    "fthg": int(m["fthg"]), "ftag": int(m["ftag"]), "ftr": m["ftr"],
                    "lh": round(eg[0], 4), "la": round(eg[1], 4),
                    "m_h": mk["WIN_HOME"], "m_d": mk["DRAW"], "m_a": mk["WIN_AWAY"],
                    "m_dc_hd": mk["DC_HOME_DRAW"], "m_dc_da": mk["DC_DRAW_AWAY"], "m_dc_ha": mk["DC_HOME_AWAY"],
                    "m_o15": mk["OVER_1_5"], "m_o25": mk["OVER_2_5"], "m_o35": mk["OVER_3_5"],
                    "m_u25": mk["UNDER_2_5"], "m_btts": mk["BTTS_YES"],
                    **{c: m[c] for c in ODDS_COLS},
                })
    out = pd.DataFrame(rows)
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(CACHE_PATH, index=False)
    print(f"Cache écrit : {CACHE_PATH}  ·  {len(out):,} matchs, {out['league_code'].nunique()} championnats")
    return out


if __name__ == "__main__":
    generate()
