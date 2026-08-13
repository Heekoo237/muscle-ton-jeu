"""Étape 4 (4.0-4.4) — rapport de backtest, déterministe, sur le cache.

    python -m mtj_model.backtest.generate   # (une fois) produit le cache
    python -m mtj_model.backtest.report

Tout se calcule sur les prédictions walk-forward mises en cache. Validation
croisée TEMPORELLE (plis chronologiques) pour le poids de fusion. On montre les
chiffres — le jugement revient au lecteur.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .closing_odds import devig_power

PKG_ROOT = Path(__file__).resolve().parents[2]
CACHE = PKG_ROOT / "data" / "predictions_2425.csv"
EPS = 1e-12


# ────────────────────────────── utilitaires ────────────────────────────────
def logloss(p, y):
    p = np.asarray(p)
    return float(-np.mean(np.log(np.clip(p[np.arange(len(y)), y], EPS, None))))


def brier(p, y):
    p = np.asarray(p)
    oh = np.zeros_like(p)
    oh[np.arange(len(y)), y] = 1.0
    return float(np.mean(np.sum((p - oh) ** 2, axis=1)))


def devig_1x2(df, phase):
    """Probabilités marché 1X2 (dé-margeage puissance), Pinnacle avec repli moyenne."""
    out = np.full((len(df), 3), np.nan)
    for book in ("ps", "avg"):
        odds = df[[f"{phase}_{book}_h", f"{phase}_{book}_d", f"{phase}_{book}_a"]].to_numpy(float)
        need = np.isnan(out).any(1) & ~np.isnan(odds).any(1)
        for i in np.where(need)[0]:
            out[i] = devig_power(odds[i])
    return out


def overround(df, phase, book="ps"):
    o = df[[f"{phase}_{book}_h", f"{phase}_{book}_d", f"{phase}_{book}_a"]].to_numpy(float)
    return np.nansum(1.0 / o, axis=1) - 1.0


def blend(model, market, w):
    p = w * model + (1 - w) * market
    return p / p.sum(1, keepdims=True)


def best_w(model, market, y, grid):
    lls = [logloss(blend(model, market, w), y) for w in grid]
    i = int(np.argmin(lls))
    return grid[i], lls[i]


def temporal_cv_w(df, model, market, y, grid, folds=5):
    """Plis chronologiques : w appris sur le passé, testé sur le bloc suivant."""
    order = np.argsort(df["date"].to_numpy())
    blocks = np.array_split(order, folds)
    ws, test = [], []
    for i in range(1, folds):
        tr = np.concatenate(blocks[:i])
        te = blocks[i]
        w, _ = best_w(model[tr], market[tr], y[tr], grid)
        ws.append(w)
        test.append(logloss(blend(model[te], market[te], w), y[te]))
    return float(np.mean(ws)), float(np.std(ws)), float(np.mean(test))


def ece_1x2(probs, df):
    """Erreur de calibration (ECE) 1X2 : on empile les 3 probas/issues en binaire."""
    y = df["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
    oh = np.zeros((len(df), 3))
    oh[np.arange(len(df)), y] = 1.0
    p = probs.ravel()
    hit = oh.ravel()
    edges = np.arange(0, 1.0001, 0.05)
    idx = np.clip(np.digitize(p, edges) - 1, 0, len(edges) - 2)
    ece = 0.0
    n = len(p)
    for b in range(len(edges) - 1):
        m = idx == b
        if m.any():
            ece += (m.sum() / n) * abs(p[m].mean() - hit[m].mean())
    return ece


# ────────────────────────────── 4.0 : ouverture ────────────────────────────
def section_40(df, y):
    print("=" * 78)
    print("4.0 — MODÈLE vs OUVERTURE (l'information disponible au calcul nocturne)")
    print("=" * 78)
    model = df[["m_h", "m_d", "m_a"]].to_numpy(float)
    op = devig_1x2(df, "open")
    grid = np.round(np.arange(0, 1.0001, 0.05), 3)
    w_cv, w_sd, ll_cv = temporal_cv_w(df, model, op, y, grid)
    w_full, ll_full = best_w(model, op, y, grid)
    print(f"  modèle seul      log-loss {logloss(model, y):.4f}   Brier {brier(model, y):.4f}")
    print(f"  ouverture seule  log-loss {logloss(op, y):.4f}   Brier {brier(op, y):.4f}")
    print(f"  fusion w*={w_full:.2f} (données)  log-loss {ll_full:.4f}")
    print(f"  fusion (val. croisée temporelle) : w = {w_cv:.2f} ± {w_sd:.2f}  → log-loss test {ll_cv:.4f}")
    print("  (w = poids du MODÈLE)\n  par championnat (log-loss) :")
    print(f"    {'championnat':<22}{'n':>5}{'modèle':>9}{'ouverture':>11}{'w*':>6}")
    for lg, g in df.groupby("league_name"):
        yy = g["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
        mm = g[["m_h", "m_d", "m_a"]].to_numpy(float)
        oo = devig_1x2(g, "open")
        w, _ = best_w(mm, oo, yy, grid)
        print(f"    {lg:<22}{len(g):>5}{logloss(mm, yy):>9.4f}{logloss(oo, yy):>11.4f}{w:>6.2f}")
    return model, op


# ────────────────────────────── 4.2 : mouvement ────────────────────────────
def section_42(df):
    print("\n" + "=" * 78)
    print("4.2 — MOUVEMENT DE COTE (ouverture → clôture)")
    print("=" * 78)
    op = devig_1x2(df, "open")
    cl = devig_1x2(df, "close")
    mov = np.nansum(np.abs(cl - op), axis=1) / 2  # variation totale (0..1)
    df = df.assign(_mov=mov)
    print("  a) amplitude du mouvement par championnat (variation totale de proba)")
    print(f"    {'championnat':<22}{'médiane':>9}{'moyenne':>9}{'>5%':>7}")
    for lg, g in df.groupby("league_name"):
        m = g["_mov"].to_numpy()
        print(f"    {lg:<22}{np.nanmedian(m)*100:>8.2f}%{np.nanmean(m)*100:>8.2f}%{100*np.nanmean(m>0.05):>6.0f}%")

    y = df["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
    print("\n  b) valeur du mouvement = ce que la clôture gagne sur l'ouverture (log-loss)")
    print(f"     ouverture {logloss(op, y):.4f}  →  clôture {logloss(cl, y):.4f}   "
          f"gain {logloss(op, y)-logloss(cl, y):+.4f}")
    print("  c) par tranche de mouvement : la clôture est-elle bien meilleure quand ça a bougé ?")
    print(f"    {'mouvement':<14}{'n':>6}{'LL ouv.':>9}{'LL clôt.':>10}{'gain':>8}")
    buckets = [(0, 0.02), (0.02, 0.05), (0.05, 0.10), (0.10, 1.01)]
    for lo, hi in buckets:
        m = (mov >= lo) & (mov < hi)
        if m.sum() > 20:
            g = logloss(op[m], y[m]) - logloss(cl[m], y[m])
            print(f"    {f'{lo*100:.0f}-{hi*100:.0f}%':<14}{m.sum():>6}{logloss(op[m], y[m]):>9.4f}"
                  f"{logloss(cl[m], y[m]):>10.4f}{g:>8.4f}")
    print("  → predicteur : la clôture n'existe pas au calcul nocturne. Le mouvement est")
    print("    informatif (la clôture bat l'ouverture) mais inobservable a priori — utile")
    print("    seulement si on recalcule plus tard. Comme SIGNAL à montrer, il reste lisible.")


# ────────────────────────────── 4.1 : désaccord ────────────────────────────
def section_41(df, model, op):
    print("\n" + "=" * 78)
    print("4.1 — LE DÉSACCORD MODÈLE/OUVERTURE COMME SIGNAL")
    print("=" * 78)
    gap = np.nansum(np.abs(model - op), axis=1) / 2
    cl = devig_1x2(df, "close")
    mov = np.nansum(np.abs(cl - op), axis=1) / 2
    ok = ~np.isnan(gap) & ~np.isnan(mov)
    r = np.corrcoef(gap[ok], mov[ok])[0, 1]
    # la cote bouge-t-elle VERS le modèle ? projection de (clôture-ouverture) sur (modèle-ouverture)
    d_model = (model - op)[ok]
    d_close = (cl - op)[ok]
    denom = np.sum(d_model * d_model, axis=1)
    proj = np.where(denom > 1e-9, np.sum(d_model * d_close, axis=1) / np.clip(denom, 1e-9, None), np.nan)
    print(f"  a) corr(désaccord, |mouvement|) = {r:+.3f}   "
          f"| la clôture se déplace-t-elle vers le modèle ? projection moyenne {np.nanmean(proj):+.3f}")
    print("     (projection > 0 = la cote bouge en moyenne DANS le sens du modèle)")

    y = df["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
    print("  b) le modèle bat-il l'ouverture quand le désaccord est fort ? (par quartile de désaccord)")
    q = pd.qcut(gap, 4, labels=["Q1 faible", "Q2", "Q3", "Q4 fort"])
    print(f"    {'quartile':<12}{'n':>6}{'LL modèle':>11}{'LL ouv.':>10}{'écart':>8}")
    for lab in ["Q1 faible", "Q2", "Q3", "Q4 fort"]:
        m = np.asarray(q == lab)
        lm, lo = logloss(model[m], y[m]), logloss(op[m], y[m])
        print(f"    {lab:<12}{m.sum():>6}{lm:>11.4f}{lo:>10.4f}{lm-lo:>8.4f}")

    print("  c) désaccord fort → la sélection favorite tombe-t-elle plus que prévu ?")
    fav = np.nanargmax(op, axis=1)
    p_fav = op[np.arange(len(op)), fav]
    lost = fav != y
    print(f"    {'quartile désaccord':<20}{'n':>6}{'échec réel':>12}{'échec implicite':>16}")
    for lab in ["Q1 faible", "Q2", "Q3", "Q4 fort"]:
        m = np.asarray(q == lab)
        print(f"    {lab:<20}{m.sum():>6}{100*lost[m].mean():>11.1f}%{100*(1-p_fav[m]).mean():>15.1f}%")


# ─────────────────────── 4.3 : calibration par championnat ──────────────────
def _belgium_playoff_flag(df_lg):
    """Playoffs belges : une paire qui s'est déjà rencontrée ≥2 fois dans la saison."""
    seen = {}
    flag = []
    for _, m in df_lg.sort_values("date").iterrows():
        key = frozenset((m["home"], m["away"]))
        c = seen.get(key, 0)
        flag.append(c >= 2)
        seen[key] = c + 1
    return np.array(flag)


def section_43(df):
    print("\n" + "=" * 78)
    print("4.3 — CALIBRATION PAR CHAMPIONNAT (modèle) — LE CRITÈRE DE COUVERTURE")
    print("=" * 78)
    print(f"  {'championnat':<22}{'n':>5}{'ECE mod.':>10}{'Brier mod.':>12}{'Brier ouv.':>12}{'marge':>8}")
    rows = []
    for lg, g in df.groupby("league_name"):
        y = g["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
        model = g[["m_h", "m_d", "m_a"]].to_numpy(float)
        op = devig_1x2(g, "open")
        ece = ece_1x2(model, g)
        bm, bo = brier(model, y), brier(op, y)
        marge = float(np.nanmean(overround(g, "open", "avg")))
        rows.append({"lg": lg, "n": len(g), "ece": ece, "bm": bm, "bo": bo, "marge": marge})
    rows.sort(key=lambda r: r["ece"])
    for r in rows:
        print(f"  {r['lg']:<22}{r['n']:>5}{r['ece']*100:>9.2f}%{r['bm']:>12.4f}{r['bo']:>12.4f}{r['marge']*100:>7.1f}%")

    # Classement A/B/C sur l'ECE (calibration), pas sur le gain.
    print("\n  Classement A/B/C (critère = CALIBRATION, ECE 1X2) :")
    for r in rows:
        grp = "A" if r["ece"] < 0.03 else ("B" if r["ece"] < 0.05 else "C")
        r["grp"] = grp
    for grp, lbl in [("A", "bien calibré — couverture normale"),
                     ("B", "calibré, moins précis — couverture confiance abaissée"),
                     ("C", "mal calibré — NON COUVERT")]:
        names = [f"{r['lg']} ({r['ece']*100:.1f}%)" for r in rows if r["grp"] == grp]
        print(f"    {grp} · {lbl}\n        {', '.join(names) if names else '—'}")

    # Belgique : régulière vs playoffs.
    bel = df[df["league_code"] == "B1"].copy()
    if len(bel):
        po = _belgium_playoff_flag(bel)
        for phase, mask in [("saison régulière", ~po), ("playoffs", po)]:
            gg = bel[mask]
            if len(gg) > 20:
                print(f"    Belgique · {phase:<16} n={len(gg):>3}  ECE {ece_1x2(gg[['m_h','m_d','m_a']].to_numpy(float), gg)*100:.2f}%")


# ──────────────────── 4.4 : marchés sans cote (modèle seul) ─────────────────
def _bin_ece(p, y):
    edges = np.arange(0, 1.0001, 0.05)
    idx = np.clip(np.digitize(p, edges) - 1, 0, len(edges) - 2)
    ece = 0.0
    for b in range(len(edges) - 1):
        m = idx == b
        if m.any():
            ece += (m.sum() / len(p)) * abs(p[m].mean() - y[m].mean())
    return ece


def section_44(df):
    print("\n" + "=" * 78)
    print("4.4 — MARCHÉS SANS COTE (modèle seul) — calibration")
    print("=" * 78)
    g = df["fthg"].to_numpy()
    a = df["ftag"].to_numpy()
    tot = g + a
    markets = {
        "Double chance 1X": (df["m_dc_hd"].to_numpy(), (df["ftr"] != "A").to_numpy().astype(int)),
        "Double chance X2": (df["m_dc_da"].to_numpy(), (df["ftr"] != "H").to_numpy().astype(int)),
        "Double chance 12": (df["m_dc_ha"].to_numpy(), (df["ftr"] != "D").to_numpy().astype(int)),
        "Plus de 1,5 but": (df["m_o15"].to_numpy(), (tot >= 2).astype(int)),
        "Plus de 3,5 buts": (df["m_o35"].to_numpy(), (tot >= 4).astype(int)),
        "Les deux marquent": (df["m_btts"].to_numpy(), ((g >= 1) & (a >= 1)).astype(int)),
    }
    print(f"  {'marché':<22}{'ECE':>8}{'Brier':>9}{'p moy.':>9}{'freq réelle':>13}")
    for name, (p, y) in markets.items():
        print(f"  {name:<22}{_bin_ece(p, y)*100:>7.2f}%{np.mean((p-y)**2):>9.4f}{p.mean()*100:>8.1f}%{y.mean()*100:>12.1f}%")
    print("  (ECE bas = bien calibré ; si élevé → marché à passer « non couvert »)")

    # BTTS : le biais est-il constant ou varie-t-il par championnat ?
    btts = ((g >= 1) & (a >= 1)).astype(int)
    print("\n  « Les deux marquent » — biais PAR championnat (réel − modèle)")
    print(f"    {'championnat':<22}{'modèle':>8}{'réel':>8}{'biais':>8}")
    order = []
    for lg, gg in df.groupby("league_name"):
        real = ((gg["fthg"] >= 1) & (gg["ftag"] >= 1)).mean()
        mod = gg["m_btts"].mean()
        order.append((lg, mod, real, real - mod))
    for lg, mod, real, bias in sorted(order, key=lambda r: r[3]):
        print(f"    {lg:<22}{100*mod:>7.1f}%{100*real:>7.1f}%{100*bias:>+7.1f}")
    print(f"    → biais global {100*(btts.mean()-df['m_btts'].mean()):+.1f} pt, mais NON constant "
          "(−1,6 à +7,4) → correction PAR LIGUE. BTTS suspendu.")


def main():
    if not CACHE.exists():
        raise SystemExit("Cache absent — lance d'abord : python -m mtj_model.backtest.generate")
    df = pd.read_csv(CACHE)
    y = df["ftr"].map({"H": 0, "D": 1, "A": 2}).to_numpy()
    print(f"Cache : {len(df):,} matchs · saison 2024-25 · walk-forward, ξ 365 j\n")
    model, op = section_40(df, y)
    section_41(df, model, op)
    section_42(df)
    section_43(df)
    section_44(df)


if __name__ == "__main__":
    main()
