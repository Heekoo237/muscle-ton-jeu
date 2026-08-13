"""Étape 3 — Fusion modèle × marché.

1. Cotes de clôture → probabilités du marché, marge retirée (deux méthodes :
   proportionnelle et puissance/logarithmique — on teste les deux).
2. Poids w de la moyenne pondérée  p = w·modèle + (1-w)·marché,  calibré par
   validation croisée (5 plis) sur la log-loss.

Lecture seule sur le cache (mtj_model.backtest.generate). Aucun LLM, déterministe.

    python -m mtj_model.backtest.generate   # (une fois) produit le cache
    python -m mtj_model.fuse
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .backtest.closing_odds import devig_power, devig_proportional

PKG_ROOT = Path(__file__).resolve().parents[1]
CACHE = PKG_ROOT / "data" / "predictions_2425.csv"
EPS = 1e-12
RNG_SEED = 12345  # plis reproductibles (déterminisme)


def _logloss(p: np.ndarray, y: np.ndarray) -> float:
    return float(-np.mean(np.log(np.clip(p[np.arange(len(y)), y], EPS, None))))


def _brier(p: np.ndarray, y: np.ndarray) -> float:
    oh = np.zeros_like(p)
    oh[np.arange(len(y)), y] = 1.0
    return float(np.mean(np.sum((p - oh) ** 2, axis=1)))


def _devig_rows(odds: np.ndarray, method) -> np.ndarray:
    return np.vstack([method(row) for row in odds])


def _blend(model: np.ndarray, market: np.ndarray, w: float) -> np.ndarray:
    p = w * model + (1.0 - w) * market
    return p / p.sum(axis=1, keepdims=True)


def _best_w(model, market, y, grid) -> tuple[float, float]:
    best_w, best_ll = 0.0, np.inf
    for w in grid:
        ll = _logloss(_blend(model, market, w), y)
        if ll < best_ll:
            best_w, best_ll = w, ll
    return best_w, best_ll


def _cv_w(model, market, y, grid, k=5):
    """Validation croisée : w choisi sur les plis d'entraînement, évalué sur le pli test."""
    rng = np.random.default_rng(RNG_SEED)
    folds = rng.permutation(len(y)) % k
    ws, test_ll = [], []
    for f in range(k):
        tr, te = folds != f, folds == f
        w, _ = _best_w(model[tr], market[tr], y[tr], grid)
        ws.append(w)
        test_ll.append(_logloss(_blend(model[te], market[te], w), y[te]))
    return float(np.mean(ws)), float(np.std(ws)), float(np.mean(test_ll))


def _report_1x2(df: pd.DataFrame) -> None:
    y = df["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
    model = df[["m_h", "m_d", "m_a"]].to_numpy(dtype=float)
    odds = df[["close_avg_h", "close_avg_d", "close_avg_a"]].to_numpy(dtype=float)

    mk_prop = _devig_rows(odds, devig_proportional)
    mk_pow = _devig_rows(odds, devig_power)

    print("=" * 70)
    print("1X2 — dé-margeage : proportionnelle vs puissance (log-loss / Brier)")
    print("=" * 70)
    for name, mk in [("proportionnelle", mk_prop), ("puissance", mk_pow)]:
        print(f"  marché {name:<16} log-loss {_logloss(mk, y):.4f}   Brier {_brier(mk, y):.4f}")
    market = mk_pow if _logloss(mk_pow, y) <= _logloss(mk_prop, y) else mk_prop
    chosen = "puissance" if market is mk_pow else "proportionnelle"
    print(f"  → retenu : {chosen}")

    grid = np.round(np.arange(0.0, 1.0001, 0.05), 3)
    print("\nCourbe log-loss de la fusion p = w·modèle + (1-w)·marché")
    print("  w   :  " + " ".join(f"{w:>5.2f}" for w in grid[::2]))
    print("  LL  :  " + " ".join(f"{_logloss(_blend(model, market, w), y):>5.3f}" for w in grid[::2]))

    w_full, ll_full = _best_w(model, market, y, grid)
    w_cv, w_sd, ll_cv = _cv_w(model, market, y, grid)
    print("\nRésultats 1X2 (log-loss ; plus bas = mieux) :")
    print(f"  modèle seul                    {_logloss(model, y):.4f}   Brier {_brier(model, y):.4f}")
    print(f"  marché seul ({chosen})    {_logloss(market, y):.4f}   Brier {_brier(market, y):.4f}")
    print(f"  fusion w*={w_full:.2f} (données)      {ll_full:.4f}   Brier {_brier(_blend(model, market, w_full), y):.4f}")
    print(f"  fusion w={w_cv:.2f}±{w_sd:.2f} (val. croisée) → log-loss test {ll_cv:.4f}")
    print(f"  (w = poids du MODÈLE ; 1-w = poids du marché)")


def _report_ou(df: pd.DataFrame) -> None:
    d = df.dropna(subset=["close_avg_o25", "close_avg_u25"]).copy()
    y = (d["fthg"] + d["ftag"] >= 3).astype(int).to_numpy()  # 0 = under, 1 = over
    model = d[["m_u25", "m_o25"]].to_numpy(dtype=float)
    odds = d[["close_avg_u25", "close_avg_o25"]].to_numpy(dtype=float)
    market = _devig_rows(odds, devig_power)

    grid = np.round(np.arange(0.0, 1.0001, 0.05), 3)
    w_full, ll_full = _best_w(model, market, y, grid)
    w_cv, w_sd, ll_cv = _cv_w(model, market, y, grid)
    print("\n" + "=" * 70)
    print(f"PLUS/MOINS 2,5 — fusion ({len(d):,} matchs, dé-margeage puissance)")
    print("=" * 70)
    print(f"  modèle seul                    {_logloss(model, y):.4f}   Brier {_brier(model, y):.4f}")
    print(f"  marché seul                    {_logloss(market, y):.4f}   Brier {_brier(market, y):.4f}")
    print(f"  fusion w*={w_full:.2f} (données)      {ll_full:.4f}")
    print(f"  fusion w={w_cv:.2f}±{w_sd:.2f} (val. croisée) → log-loss test {ll_cv:.4f}")


def main() -> None:
    if not CACHE.exists():
        raise SystemExit("Cache absent — lance d'abord : python -m mtj_model.backtest.generate")
    df = pd.read_csv(CACHE)
    print(f"Cache : {len(df):,} matchs · {df['league_code'].nunique()} championnats · saison 2024-25\n")
    _report_1x2(df)
    _report_ou(df)


if __name__ == "__main__":
    main()
