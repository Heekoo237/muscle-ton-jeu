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
from ..poisson import score_matrix
from ..strength import fit_league

PKG_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = PKG_ROOT / "data" / "mtj_stats.db"
CACHE_PATH = PKG_ROOT / "data" / "predictions_2425.csv"
EVAL_SEASON = "2425"
GRID = 11

ODDS_COLS = [
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


def _probs_1x2_ou(mat: np.ndarray) -> tuple[float, float, float, float, float]:
    i = np.arange(GRID)
    home, away = i[:, None], i[None, :]
    ph = float(mat[home > away].sum())
    pd_ = float(np.trace(mat))
    pa = float(mat[home < away].sum())
    over = float(mat[(home + away) >= 3].sum())
    return ph, pd_, pa, over, 1.0 - over


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
                ph, pd_, pa, over, under = _probs_1x2_ou(score_matrix(eg[0], eg[1], fit.rho, size=GRID))
                rows.append({
                    "league_code": m["league_code"], "league_name": m["league_name"],
                    "date": m["date"].date().isoformat(), "home": m["home"], "away": m["away"],
                    "fthg": int(m["fthg"]), "ftag": int(m["ftag"]), "ftr": m["ftr"],
                    "lh": round(eg[0], 4), "la": round(eg[1], 4),
                    "m_h": ph, "m_d": pd_, "m_a": pa, "m_o25": over, "m_u25": under,
                    **{c: m[c] for c in ODDS_COLS},
                })
    out = pd.DataFrame(rows)
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(CACHE_PATH, index=False)
    print(f"Cache écrit : {CACHE_PATH}  ·  {len(out):,} matchs, {out['league_code'].nunique()} championnats")
    return out


if __name__ == "__main__":
    generate()
