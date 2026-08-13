"""Étape 2 — Calibration de ξ (pondération par récence) par vraisemblance.

ξ n'est PAS choisi arbitrairement. On ne peut pas non plus l'ajuster en même
temps que les forces sur les mêmes données (la vraisemblance en échantillon est
maximisée à ξ = 0, aucune décote). On l'optimise donc par vraisemblance
PRÉDICTIVE en avant (walk-forward) :

  - pour chaque championnat, on rejoue la dernière saison journée par journée ;
  - à chaque semaine, on réajuste les forces sur TOUT le passé, pondéré exp(-ξ·âge) ;
  - on prédit les matchs de la semaine et on cumule log P(score réel).

Le ξ qui maximise cette log-vraisemblance prédictive (sommée sur tous les
championnats) est retenu. On rapporte ξ et la demi-vie ln(2)/ξ en jours.

    python -m mtj_model.calibrate
"""
from __future__ import annotations

import json
import math
import sqlite3
import time
from pathlib import Path

import numpy as np
import pandas as pd

from .poisson import score_matrix
from .strength import fit_league

PKG_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PKG_ROOT / "data" / "mtj_stats.db"
OUT_PATH = PKG_ROOT / "data" / "xi_calibration.json"
EVAL_SEASON = "2425"  # dernière saison : ≥ 2 saisons d'historique en amont
GRID_SIZE = 11  # grille de score plus large pour l'évaluation (évite de tronquer)


def _load() -> dict[str, pd.DataFrame]:
    con = sqlite3.connect(DB_PATH)
    df = pd.read_sql(
        "select league_code,season_code,date,home,away,fthg,ftag from matches",
        con, parse_dates=["date"],
    )
    con.close()
    return {lg: g.sort_values("date").reset_index(drop=True) for lg, g in df.groupby("league_code")}


def _predictive_ll_league(g: pd.DataFrame, xi: float) -> tuple[float, int, int]:
    """Log-vraisemblance prédictive (walk-forward hebdomadaire) sur la dernière saison."""
    eval_df = g[g["season_code"] == EVAL_SEASON]
    if eval_df.empty:
        return 0.0, 0, 0
    # Semaines ISO d'évaluation, dans l'ordre.
    weeks = eval_df["date"].dt.to_period("W")
    ll = 0.0
    n = 0
    skipped = 0
    start = None
    for _, wk in eval_df.groupby(weeks):
        cutoff = wk["date"].min()
        history = g[g["date"] < cutoff]
        if history["home"].nunique() < 4:
            skipped += len(wk)
            continue
        fit = fit_league(history, cutoff, xi, start=start)
        start = fit.params
        for _, m in wk.iterrows():
            eg = fit.expected_goals(m["home"], m["away"])
            if eg is None:
                skipped += 1
                continue
            mat = score_matrix(eg[0], eg[1], fit.rho, size=GRID_SIZE)
            gh = min(int(m["fthg"]), GRID_SIZE - 1)
            ga = min(int(m["ftag"]), GRID_SIZE - 1)
            ll += math.log(max(mat[gh, ga], 1e-12))
            n += 1
    return ll, n, skipped


def predictive_ll(leagues: dict[str, pd.DataFrame], xi: float) -> tuple[float, int, int]:
    total_ll = 0.0
    total_n = 0
    total_skip = 0
    for g in leagues.values():
        ll, n, sk = _predictive_ll_league(g, xi)
        total_ll += ll
        total_n += n
        total_skip += sk
    return total_ll, total_n, total_skip


def _xi_from_halflife(hl_days: float) -> float:
    return math.log(2) / hl_days


def calibrate() -> dict:
    leagues = _load()
    print(f"Championnats : {len(leagues)}  ·  évaluation walk-forward sur la saison {EVAL_SEASON}\n")

    # Grille de demi-vies (jours) → ξ. On mesure la log-vraisemblance prédictive
    # MOYENNE par match (comparable, indépendante du nombre de matchs).
    halflives = [20, 30, 45, 60, 90, 120, 180, 240, 365, 540]
    rows = []
    print(f"{'demi-vie (j)':>12} {'ξ (par jour)':>14} {'log-vrais./match':>18} {'n':>7}")
    for hl in halflives:
        xi = _xi_from_halflife(hl)
        t0 = time.time()
        ll, n, sk = predictive_ll(leagues, xi)
        avg = ll / n if n else float("-nan")
        rows.append({"halflife_days": hl, "xi": xi, "avg_loglik": avg, "n": n, "skipped": sk})
        print(f"{hl:>12} {xi:>14.6f} {avg:>18.5f} {n:>7}   ({time.time()-t0:.0f}s)")

    # Raffinement par section dorée autour du meilleur point de la grille.
    best = max(rows, key=lambda r: r["avg_loglik"])
    i = halflives.index(best["halflife_days"])
    lo = halflives[max(0, i - 1)]
    hi = halflives[min(len(halflives) - 1, i + 1)]
    print(f"\nMeilleur point grille : demi-vie {best['halflife_days']} j — raffinement dans [{lo}, {hi}] j")

    phi = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    cache: dict[float, float] = {}

    def score(hl: float) -> float:
        key = round(hl, 1)
        if key not in cache:
            ll, n, _ = predictive_ll(leagues, _xi_from_halflife(key))
            cache[key] = ll / n if n else float("-inf")
            print(f"  demi-vie {key:>6.1f} j → log-vrais./match {cache[key]:.5f}")
        return cache[key]

    c, d = b - phi * (b - a), a + phi * (b - a)
    fc, fd = score(c), score(d)
    for _ in range(6):
        if fc > fd:
            b, d, fd = d, c, fc
            c = b - phi * (b - a)
            fc = score(c)
        else:
            a, c, fc = c, d, fd
            d = a + phi * (b - a)
            fd = score(d)
    best_hl = round((a + b) / 2, 1)
    best_avg = score(best_hl)
    best_xi = _xi_from_halflife(best_hl)

    result = {
        "xi_per_day": best_xi,
        "half_life_days": best_hl,
        "avg_loglik_per_match": best_avg,
        "eval_season": EVAL_SEASON,
        "grid": rows,
    }
    OUT_PATH.write_text(json.dumps(result, indent=2))

    print("\n" + "=" * 56)
    print("RÉSULTAT — pondération par récence (ξ)")
    print(f"  ξ            = {best_xi:.6f}  par jour")
    print(f"  demi-vie     = {best_hl:.1f} jours")
    print(f"  log-vrais./match (prédictive) = {best_avg:.5f}")
    print(f"  écrit dans   : {OUT_PATH}")
    print("=" * 56)
    return result


if __name__ == "__main__":
    calibrate()
