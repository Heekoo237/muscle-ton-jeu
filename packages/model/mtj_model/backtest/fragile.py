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


def _valid_odds(df: pd.DataFrame) -> pd.DataFrame:
    oc = ["open_ps_h", "open_ps_d", "open_ps_a", "open_ps_o25", "open_ps_u25"]
    d = df.dropna(subset=oc)
    return d[(d[oc] > 1.01).all(axis=1)].reset_index(drop=True)


def _market_selections(df: pd.DataFrame) -> dict:
    """Proba AFFICHÉE (selon PROBABILITY_SOURCE) et issue, par marché."""
    ftr = df["ftr"].to_numpy()
    tot = (df["fthg"] + df["ftag"]).to_numpy()
    op = np.vstack([devig_power(r) for r in df[["open_ps_h", "open_ps_d", "open_ps_a"]].to_numpy(float)])
    fav = op.argmax(1)
    y = df["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
    dc = df[["m_dc_hd", "m_dc_da", "m_dc_ha"]].to_numpy(float)
    cov = {0: {"H", "D"}, 1: {"D", "A"}, 2: {"H", "A"}}
    pk = dc.argmax(1)
    ou = np.vstack([devig_power(r) for r in df[["open_ps_o25", "open_ps_u25"]].to_numpy(float)])
    os_ = ou.argmax(1)
    return {
        "1X2 (cote)": (op[np.arange(len(df)), fav], fav == y),
        "double chance (mod)": (dc[np.arange(len(df)), pk],
                                np.array([ftr[i] in cov[pk[i]] for i in range(len(df))])),
        "plus de 1,5 (mod)": (df["m_o15"].to_numpy(float), tot >= 2),
        "plus de 3,5 (mod)": (df["m_o35"].to_numpy(float), tot >= 4),
        "plus/moins 2,5 (cote)": (ou[np.arange(len(df)), os_], np.where(os_ == 0, tot >= 3, tot <= 2)),
    }


def _all_market_probs(df: pd.DataFrame) -> dict:
    """Proba AFFICHÉE (selon PROBABILITY_SOURCE) et issue réelle, PAR MARCHÉ ET PAR
    ISSUE. 1X2 et plus/moins 2,5 = cote dé-vigée ; le reste = modèle. UNDER_1_5 et
    UNDER_3_5 dérivés du modèle over (P(under) = 1 − P(over)). Sert au critère du badge."""
    ftr = df["ftr"].to_numpy()
    tot = (df["fthg"] + df["ftag"]).to_numpy()

    def dv(cols):
        p = np.full((len(df), len(cols)), np.nan)
        sub = df[cols]
        valid = sub.notna().all(axis=1) & (sub > 1.01).all(axis=1)
        for i in np.where(valid.to_numpy())[0]:
            p[i] = devig_power(df.loc[i, cols].to_numpy(float))
        return p

    o3 = dv(["open_ps_h", "open_ps_d", "open_ps_a"])
    o2 = dv(["open_ps_o25", "open_ps_u25"])
    m = df
    return {
        "WIN_HOME": (o3[:, 0], ftr == "H"),
        "DRAW": (o3[:, 1], ftr == "D"),
        "WIN_AWAY": (o3[:, 2], ftr == "A"),
        "DC_HOME_DRAW": (m["m_dc_hd"].to_numpy(float), np.isin(ftr, ["H", "D"])),
        "DC_DRAW_AWAY": (m["m_dc_da"].to_numpy(float), np.isin(ftr, ["D", "A"])),
        "DC_HOME_AWAY": (m["m_dc_ha"].to_numpy(float), np.isin(ftr, ["H", "A"])),
        "OVER_1_5": (m["m_o15"].to_numpy(float), tot >= 2),
        "UNDER_1_5": (1 - m["m_o15"].to_numpy(float), tot <= 1),
        "OVER_2_5": (o2[:, 0], tot >= 3),
        "UNDER_2_5": (o2[:, 1], tot <= 2),
        "OVER_3_5": (m["m_o35"].to_numpy(float), tot >= 4),
        "UNDER_3_5": (1 - m["m_o35"].to_numpy(float), tot <= 3),
    }


def _badge_decision(df: pd.DataFrame) -> None:
    """SOURCE UNIQUE des deux constantes (seuil de retrait ET visibilité du badge).
    Régénère `FRAGILE_BADGE_VISIBLE` à chaque (re)calibrage — copier la colonne
    « badge » dans constants.py / markets-meta.ts. Le badge NE dépend PAS de la
    précision absolue (l'ancienne erreur : sur le nul, 75 % de précision = 75 % de
    base, gain nul) mais du GAIN sur la base ET d'un marquage qui reste RARE :

        badge  ⇔  gain ≥ FRAGILE_BADGE_MIN_GAIN (pts)  ET  marquage ≤ FRAGILE_BADGE_MAX_MARKING
    """
    from ..constants import (
        FRAGILE_THRESHOLDS,
        FRAGILE_BADGE_MIN_GAIN,
        FRAGILE_BADGE_MAX_MARKING,
    )

    print("\n" + "=" * 78)
    print("Décision BADGE par marché — critère GAIN sur la base, JAMAIS précision absolue")
    print(f"  badge  ⇔  gain ≥ {FRAGILE_BADGE_MIN_GAIN:.0f} pts  ET  marquage ≤ {100*FRAGILE_BADGE_MAX_MARKING:.0f} %")
    print("=" * 78)
    print(f"  {'marché':<14}{'seuil':>6}{'%marqué':>9}{'base':>7}{'préc':>7}{'GAIN':>7}{'  badge'}")
    for name, (p, won) in _all_market_probs(df).items():
        ok = ~np.isnan(p)
        p = p[ok]
        won = np.asarray(won)[ok]
        lost = ~won
        seuil = FRAGILE_THRESHOLDS.get(name)
        if seuil is None:
            continue
        flag = p < seuil
        marquage = flag.mean()
        base = 100 * lost.mean()
        prec = 100 * lost[flag].mean() if flag.sum() else 0.0
        gain = prec - base
        badge = gain >= FRAGILE_BADGE_MIN_GAIN and marquage <= FRAGILE_BADGE_MAX_MARKING
        verdict = "OUI" if badge else "non (neutre)"
        print(f"  {name:<14}{seuil:>6.2f}{100*marquage:>8.0f}%{base:>6.0f}%{prec:>6.0f}%{gain:>+6.1f}   {verdict}")
    print("  Rappel : seuils recalibrés PAR ISSUE (Direction 2). Chaque issue marque")
    print("  ~30 % → badge mérité partout sauf « l'un ou l'autre » (12, gain +2,6 < 5).")


def _pr_curves(df: pd.DataFrame) -> None:
    """Le point de fonctionnement est une DÉCISION PRODUIT : précision/rappel à
    plusieurs fractions de sélections marquées, par marché."""
    d = _valid_odds(df)
    print("\n" + "=" * 74)
    print("Courbe précision/rappel par point de fonctionnement (% marqué fragile)")
    print("=" * 74)
    for name, (p, won) in _market_selections(d).items():
        lost = ~np.asarray(won)
        base = 100 * lost.mean()
        print(f"{name:<22} base échec {base:4.1f}%   n={len(p)}")
        print(f"    {'%marqué':>8}{'seuil':>8}{'précis.':>9}{'vs base':>9}{'rappel':>9}")
        for frac in (0.20, 0.30, 0.40, 0.50, 0.60):
            t = float(np.quantile(p, frac))
            flag = p < t
            prec = 100 * lost[flag].mean() if flag.sum() else 0.0
            rec = 100 * flag[lost].mean() if lost.sum() else 0.0
            print(f"    {100*flag.mean():>7.0f}%{t:>8.2f}{prec:>8.0f}%{prec-base:>+8.1f}{rec:>8.0f}%")
        print()


def _mixed_ticket(df: pd.DataFrame, op_point=0.30) -> None:
    """Ticket mixte réaliste (3 double chance + 3 plus/moins + 3 en 1X2) : le
    chiffre des maquettes. Proba combinée = produit des sélections affichées."""
    d = _valid_odds(df)
    tot = (d["fthg"] + d["ftag"]).to_numpy()
    op = np.vstack([devig_power(r) for r in d[["open_ps_h", "open_ps_d", "open_ps_a"]].to_numpy(float)])
    p_1x2 = op[np.arange(len(d)), op.argmax(1)]
    p_dc = d[["m_dc_hd", "m_dc_da", "m_dc_ha"]].to_numpy(float).max(1)
    ou = np.vstack([devig_power(r) for r in d[["open_ps_o25", "open_ps_u25"]].to_numpy(float)])
    p_ou = ou.max(1)
    pools = {"1x2": p_1x2, "dc": p_dc, "ou": p_ou}
    thr = {m: float(np.quantile(v, op_point)) for m, v in pools.items()}
    rng = np.random.default_rng(SEED)
    N = len(d)

    def sample(reinforce=False, floor=4, n=60000):
        out = []
        for _ in range(n):
            idx = rng.choice(N, size=9, replace=False)
            legs = ([("1x2", p_1x2[idx[i]]) for i in range(3)]
                    + [("dc", p_dc[idx[i]]) for i in range(3, 6)]
                    + [("ou", p_ou[idx[i]]) for i in range(6, 9)])
            ps = np.array([p for _, p in legs])
            if reinforce:
                keep = np.array([p >= thr[m] for m, p in legs])
                if keep.sum() < floor:
                    keep = np.zeros(9, bool)
                    keep[np.argsort(ps)[::-1][:floor]] = True
                ps = ps[keep]
            out.append(float(np.prod(ps)))
        return np.array(out)

    raw, ren = sample(), sample(reinforce=True)
    print("\n" + "=" * 74)
    print("Ticket MIXTE réaliste (3 double chance + 3 plus/moins 2,5 + 3 en 1X2)")
    print("=" * 74)
    print(f"  proba/jambe : 1X2 {np.median(p_1x2):.2f} · DC {np.median(p_dc):.2f} · +/-2,5 {np.median(p_ou):.2f}")
    print(f"  BRUT     médiane {100*np.median(raw):5.2f}%  (q25 {100*np.quantile(raw,.25):.2f}%  q75 {100*np.quantile(raw,.75):.2f}%)")
    print(f"  RENFORCÉ médiane {100*np.median(ren):5.2f}%  (retrait au point {op_point:.0%}, plancher 4)")
    print("  → les maquettes (1,3 % → 7,5 %) sont cohérentes avec ce profil mixte.")


def _per_market_thresholds(df: pd.DataFrame) -> None:
    """Seuil par marché : les probas sont plus hautes sur les marchés sûrs, un
    seuil unique à 0,55 ne marquerait presque rien en double chance."""
    ftr = df["ftr"].to_numpy()
    tot = (df["fthg"] + df["ftag"]).to_numpy()
    covered = {0: {"H", "D"}, 1: {"D", "A"}, 2: {"H", "A"}}
    dc = df[["m_dc_hd", "m_dc_da", "m_dc_ha"]].to_numpy(float)
    pick = dc.argmax(1)
    markets = {
        "1X2 (favori)": (None, None),  # traité à part ci-dessus
        "double chance": (dc[np.arange(len(df)), pick],
                          np.array([ftr[i] in covered[pick[i]] for i in range(len(df))])),
        "plus de 1,5": (df["m_o15"].to_numpy(float), tot >= 2),
        "plus de 2,5": (df["m_o25"].to_numpy(float), tot >= 3),
        "plus de 3,5": (df["m_o35"].to_numpy(float), tot >= 4),
        "moins de 2,5": (df["m_u25"].to_numpy(float), tot <= 2),
    }
    print("\n" + "=" * 66)
    print("Seuil PAR MARCHÉ — calé pour marquer ~60 % des sélections (comme 1X2)")
    print("=" * 66)
    print(f"  {'marché':<16}{'base échec':>11}{'p médiane':>11}{'seuil':>8}{'préc':>7}{'rappel':>8}")
    for name, (p, won) in markets.items():
        if p is None:
            continue
        lost = ~np.asarray(won)
        t = float(np.quantile(p, 0.60))  # seuil marquant ~60 % des sélections
        flag = p < t
        prec = 100 * lost[flag].mean() if flag.sum() else 0.0
        rec = 100 * flag[lost].mean() if lost.sum() else 0.0
        print(f"  {name:<16}{100*lost.mean():>10.1f}%{np.median(p):>11.2f}{t:>8.2f}{prec:>6.0f}%{rec:>7.0f}%")


def _ticket_probability(sel: pd.DataFrame) -> None:
    """Proba combinée affichée = produit des sélections. Le chiffre des maquettes."""
    rng = np.random.default_rng(SEED)
    p = sel["p_model"].to_numpy()
    N = len(p)

    def sample(k, reinforce=False, t=0.55, floor=4, n=40000):
        out = []
        for _ in range(n):
            pk = p[rng.choice(N, size=k, replace=False)]
            if reinforce:
                keep = pk >= t
                if keep.sum() < floor:
                    keep = np.zeros(k, bool)
                    keep[np.argsort(pk)[::-1][:floor]] = True
                pk = pk[keep]
            out.append(float(np.prod(pk)))
        return np.array(out)

    print("\n" + "=" * 66)
    print("Proba combinée du ticket (produit) — le chiffre des maquettes")
    print("=" * 66)
    for k in (6, 9, 12):
        tp = sample(k)
        print(f"  {k:>2} sél. BRUT      médiane {100*np.median(tp):5.2f}%  "
              f"(q25 {100*np.quantile(tp,.25):4.2f}%  q75 {100*np.quantile(tp,.75):4.2f}%)")
    tp9 = sample(9, reinforce=True)
    print(f"   9 sél. RENFORCÉ  médiane {100*np.median(tp9):5.2f}%  (retrait <0,55, plancher 4)")


def main():
    if not CACHE.exists():
        raise SystemExit("Cache absent — lance d'abord : python -m mtj_model.backtest.generate")
    df = pd.read_csv(CACHE)
    df = df.dropna(subset=["open_ps_h", "open_ps_d", "open_ps_a", "close_ps_h", "close_ps_d", "close_ps_a"]).reset_index(drop=True)
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

    _per_market_thresholds(df)
    _badge_decision(df)
    _ticket_probability(sel)
    _pr_curves(df)
    _mixed_ticket(df)


if __name__ == "__main__":
    main()
