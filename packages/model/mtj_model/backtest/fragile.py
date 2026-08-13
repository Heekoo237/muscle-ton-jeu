"""Étape 4.5 — Seuil de fragilité, sur tickets synthétiques.

Une « sélection » = le favori 1X2 (par la cote d'ouverture) d'un match, avec la
probabilité du MODÈLE attachée (c'est elle que le produit affiche). Elle « tombe »
si l'issue ne se produit pas. On reconstruit des tickets synthétiques de 6 à 12
sélections (matchs distincts) ; un ticket tombe si UNE sélection tombe.

On mesure : à quel niveau de probabilité une sélection devient statistiquement
responsable de la chute, et on compare trois définitions de « fragile » :
  1. probabilité basse seule
  2. probabilité basse OU désaccord modèle/marché fort
  3. probabilité basse OU mouvement de cote important

    python -m mtj_model.backtest.fragile
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .closing_odds import devig_power

PKG_ROOT = Path(__file__).resolve().parents[2]
CACHE = PKG_ROOT / "data" / "predictions_2425.csv"
SEED = 2025
DISAGREE = 0.10  # « désaccord fort » : variation totale modèle/ouverture > 10 pts
MOVE = 0.05      # « mouvement important » : ouverture→clôture > 5 pts


def _selections(df: pd.DataFrame) -> pd.DataFrame:
    """Une sélection par match : favori d'ouverture, proba du modèle, issue."""
    need = ["open_ps_h", "open_ps_d", "open_ps_a", "close_ps_h", "close_ps_d", "close_ps_a"]
    df = df.dropna(subset=need).reset_index(drop=True)
    model = df[["m_h", "m_d", "m_a"]].to_numpy(float)
    op = np.vstack([devig_power(r) for r in df[["open_ps_h", "open_ps_d", "open_ps_a"]].to_numpy(float)])
    cl = np.vstack([devig_power(r) for r in df[["close_ps_h", "close_ps_d", "close_ps_a"]].to_numpy(float)])
    y = df["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
    fav = np.argmax(op, axis=1)
    idx = np.arange(len(df))
    return pd.DataFrame({
        "p_model": model[idx, fav],
        "p_market": op[idx, fav],
        "won": (fav == y),
        "gap": np.abs(model - op).sum(1) / 2,
        "move": np.abs(cl - op).sum(1) / 2,
    })


def _tickets(sel: pd.DataFrame, n_tickets=60000):
    rng = np.random.default_rng(SEED)
    won = sel["won"].to_numpy()
    p = sel["p_model"].to_numpy()
    N = len(sel)
    rows = []
    for _ in range(n_tickets):
        k = rng.integers(6, 13)
        pick = rng.choice(N, size=k, replace=False)
        fell = not won[pick].all()
        rows.append((fell, pick[np.argmin(p[pick])]))  # ticket tombé ?, sélection la plus faible
    return rows


def main():
    if not CACHE.exists():
        raise SystemExit("Cache absent — lance d'abord : python -m mtj_model.backtest.generate")
    df = pd.read_csv(CACHE)
    sel = _selections(df)
    won = sel["won"].to_numpy()
    p = sel["p_model"].to_numpy()
    print(f"Sélections (favori d'ouverture) : {len(sel):,}  ·  taux d'échec global {100*(~won).mean():.1f}%\n")

    print("=" * 66)
    print("Calibration des sélections : la proba du modèle prédit-elle l'échec ?")
    print("=" * 66)
    print(f"  {'proba modèle':<16}{'n':>6}{'échec réel':>12}{'échec attendu':>15}")
    for lo, hi in [(0, .40), (.40, .50), (.50, .55), (.55, .60), (.60, .70), (.70, 1.01)]:
        m = (p >= lo) & (p < hi)
        if m.sum():
            print(f"  {f'{lo:.2f}-{hi:.2f}':<16}{m.sum():>6}{100*(~won[m]).mean():>11.1f}%{100*(1-p[m]).mean():>14.1f}%")

    # Tickets synthétiques : d'où viennent les chutes ?
    tk = _tickets(sel)
    fell = np.array([t[0] for t in tk])
    weak = np.array([t[1] for t in tk])
    p_weak = p[weak]
    print("\n" + "=" * 66)
    print(f"Tickets synthétiques (6-12 sél.) : {len(tk):,}  ·  {100*fell.mean():.1f}% tombent")
    print("=" * 66)
    print("  La sélection la plus faible (proba mini) est-elle la coupable ?")
    print(f"    proba de la sélection la plus faible, tickets TOMBÉS   : médiane {np.median(p_weak[fell]):.2f}")
    print("    part des chutes où le maillon faible est sous le seuil t :")
    for t in [0.50, 0.55, 0.60, 0.65]:
        share = (p_weak[fell] < t).mean()
        print(f"      t = {t:.2f} → {100*share:.0f}% des tickets tombés ont leur maillon faible < {t:.2f}")

    print("\n" + "=" * 66)
    print("Trois définitions de « fragile » — précision / rappel sur les sélections perdantes")
    print("=" * 66)
    lost = ~won
    print(f"  {'définition':<40}{'seuil':>8}{'précision':>11}{'rappel':>9}{'%flag':>8}")
    for t in [0.50, 0.55, 0.60]:
        defs = {
            f"1. proba < {t:.2f}": p < t,
            f"2. proba < {t:.2f} OU désaccord > {DISAGREE:.0%}": (p < t) | (sel["gap"].to_numpy() > DISAGREE),
            f"3. proba < {t:.2f} OU mouvement > {MOVE:.0%}": (p < t) | (sel["move"].to_numpy() > MOVE),
        }
        for name, flag in defs.items():
            if flag.sum():
                prec = lost[flag].mean()
                rec = flag[lost].mean()
                print(f"  {name:<40}{'':>8}{100*prec:>10.1f}%{100*rec:>8.1f}%{100*flag.mean():>7.0f}%")
        print()


if __name__ == "__main__":
    main()
