"""Contrôles avant l'étape 3 : le modèle bat-il une référence naïve, et quels
championnats sont les plus durs à prédire ?

On rejoue la dernière saison en walk-forward (mêmes prédictions que la
calibration, à ξ retenu). Pour chaque match on mesure DEUX cibles :

  - Score exact  : log P(score réel) — c'est la métrique optimisée pour ξ
                   (≈ -2,96/match). Référence naïve : Poisson à la moyenne du
                   championnat (chaque match = un match « moyen », sans forces).
  - Résultat 1X2 : log-loss de (domicile / nul / extérieur). Référence naïve :
                   la fréquence de base du championnat (part moyenne H/N/A).

⚠️ Les deux ne sont PAS comparables entre elles : prédire un score exact est bien
plus dur qu'un 1X2 (beaucoup plus d'issues), d'où un log-lik score beaucoup plus
négatif qu'un log-loss 1X2. On compare toujours modèle vs naïf SUR LA MÊME cible.

    python -m mtj_model.evaluate
"""
from __future__ import annotations

import math
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

from .constants import RECENCY_HALF_LIFE_DAYS, XI_PER_DAY
from .poisson import score_matrix
from .strength import fit_league

PKG_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PKG_ROOT / "data" / "mtj_stats.db"
EVAL_SEASON = "2425"
GRID = 11


def _load() -> dict[str, pd.DataFrame]:
    con = sqlite3.connect(DB_PATH)
    df = pd.read_sql(
        "select league_code,league_name,season_code,date,home,away,fthg,ftag,ftr from matches",
        con, parse_dates=["date"],
    )
    con.close()
    return {lg: g.sort_values("date").reset_index(drop=True) for lg, g in df.groupby("league_code")}


def _logscore(mat: np.ndarray, gh: int, ga: int) -> float:
    return math.log(max(mat[min(gh, GRID - 1), min(ga, GRID - 1)], 1e-12))


def evaluate_league(g: pd.DataFrame, xi: float) -> dict:
    name = g["league_name"].iloc[0]
    train = g[g["season_code"] != EVAL_SEASON]
    eval_df = g[g["season_code"] == EVAL_SEASON]

    # Références naïves, apprises sur l'entraînement seulement (aucun coup d'œil au test).
    br = train["ftr"].value_counts(normalize=True)
    base = {o: float(br.get(o, 1e-6)) for o in ("H", "D", "A")}
    lam_h = float(train["fthg"].mean())
    lam_a = float(train["ftag"].mean())
    naive_mat = score_matrix(lam_h, lam_a, rho=0.0, size=GRID)

    acc = {k: 0.0 for k in ("m_score", "n_score", "m_1x2", "n_1x2")}
    n = 0
    start = None
    for _, wk in eval_df.groupby(eval_df["date"].dt.to_period("W")):
        cutoff = wk["date"].min()
        hist = g[g["date"] < cutoff]
        if hist["home"].nunique() < 4:
            continue
        fit = fit_league(hist, cutoff, xi, start=start)
        start = fit.params
        for _, m in wk.iterrows():
            eg = fit.expected_goals(m["home"], m["away"])
            if eg is None:
                continue
            gh, ga = int(m["fthg"]), int(m["ftag"])
            o = m["ftr"]
            mat = score_matrix(eg[0], eg[1], fit.rho, size=GRID)
            # score exact
            acc["m_score"] += _logscore(mat, gh, ga)
            acc["n_score"] += _logscore(naive_mat, gh, ga)
            # 1X2
            ph = float(mat[np.arange(GRID)[:, None] > np.arange(GRID)[None, :]].sum())
            pd_ = float(np.trace(mat))
            pa = float(mat[np.arange(GRID)[:, None] < np.arange(GRID)[None, :]].sum())
            probs = {"H": ph, "D": pd_, "A": pa}
            acc["m_1x2"] += -math.log(max(probs[o], 1e-12))
            acc["n_1x2"] += -math.log(max(base[o], 1e-12))
            n += 1

    return {
        "league": name,
        "n": n,
        "model_score_ll": acc["m_score"] / n if n else float("nan"),
        "naive_score_ll": acc["n_score"] / n if n else float("nan"),
        "model_1x2_logloss": acc["m_1x2"] / n if n else float("nan"),
        "naive_1x2_logloss": acc["n_1x2"] / n if n else float("nan"),
    }


def main() -> None:
    leagues = _load()
    print(f"ξ retenu : demi-vie {RECENCY_HALF_LIFE_DAYS:.0f} j (ξ = {XI_PER_DAY:.6f}/j) · saison {EVAL_SEASON}\n")
    rows = [evaluate_league(g, XI_PER_DAY) for g in leagues.values()]
    df = pd.DataFrame(rows)

    tot_n = int(df["n"].sum())
    w = df["n"] / tot_n
    agg = {c: float((df[c] * w).sum()) for c in ["model_score_ll", "naive_score_ll", "model_1x2_logloss", "naive_1x2_logloss"]}

    print("=" * 74)
    print("CONTRÔLE 1 — le modèle bat-il la référence naïve ? (moyenne pondérée)")
    print("=" * 74)
    print(f"  Score exact   log-lik/match :  modèle {agg['model_score_ll']:+.4f}   "
          f"naïf(moyenne) {agg['naive_score_ll']:+.4f}   gain {agg['model_score_ll']-agg['naive_score_ll']:+.4f}")
    print(f"  Résultat 1X2  log-loss      :  modèle {agg['model_1x2_logloss']:.4f}   "
          f"naïf(base) {agg['naive_1x2_logloss']:.4f}   gain {agg['naive_1x2_logloss']-agg['model_1x2_logloss']:+.4f}")
    print("  (log-lik : plus haut = mieux ; log-loss : plus bas = mieux)")

    print("\n" + "=" * 74)
    print("CONTRÔLE 2 — difficulté par championnat (ξ retenu)")
    print("=" * 74)
    df = df.sort_values("model_1x2_logloss")
    print(f"{'championnat':<22}{'n':>5}{'1X2 modèle':>12}{'1X2 naïf':>11}{'gain':>8}{'score modèle':>14}")
    for _, r in df.iterrows():
        print(f"{r['league']:<22}{int(r['n']):>5}{r['model_1x2_logloss']:>12.4f}"
              f"{r['naive_1x2_logloss']:>11.4f}{r['naive_1x2_logloss']-r['model_1x2_logloss']:>8.4f}"
              f"{r['model_score_ll']:>14.4f}")
    print(f"\n{'ENSEMBLE':<22}{tot_n:>5}{agg['model_1x2_logloss']:>12.4f}{agg['naive_1x2_logloss']:>11.4f}"
          f"{agg['naive_1x2_logloss']-agg['model_1x2_logloss']:>8.4f}{agg['model_score_ll']:>14.4f}")


if __name__ == "__main__":
    main()
