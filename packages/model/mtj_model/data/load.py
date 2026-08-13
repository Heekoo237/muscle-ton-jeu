"""Étape 1 — Télécharge, parse et charge en base les données historiques.

Rejouable en une commande :

    python -m mtj_model.data.load            # télécharge (cache) + charge + résumé
    python -m mtj_model.data.load --force    # re-télécharge tout
    MTJ_DATA_SOURCE=footballdata python -m mtj_model.data.load   # source officielle

Sortie : une base SQLite ISOLÉE (packages/model/data/mtj_stats.db), sans aucun
lien avec l'application web. Deux tables :
  - matches_raw : toutes les colonnes des CSV, telles quelles (« charge tout »).
  - matches     : table propre, typée, prête pour le modèle (résultats + cotes
                  de clôture 1X2 et plus/moins 2,5, moyenne marché et Pinnacle).
"""
from __future__ import annotations

import argparse
import sqlite3
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

from .sources import LEAGUES, SEASONS, all_targets, csv_url, data_source

PKG_ROOT = Path(__file__).resolve().parents[2]  # packages/model
RAW_DIR = PKG_ROOT / "data" / "raw"
DB_PATH = PKG_ROOT / "data" / "mtj_stats.db"

# Colonnes de cotes de clôture football-data (préfixe « C » = closing).
CLOSE_1X2 = {
    "avg": ("AvgCH", "AvgCD", "AvgCA"),  # moyenne du marché
    "ps": ("PSCH", "PSCD", "PSCA"),      # Pinnacle (sharp)
    "b365": ("B365CH", "B365CD", "B365CA"),
}
CLOSE_OU25 = {
    "avg": ("AvgC>2.5", "AvgC<2.5"),
    "ps": ("PC>2.5", "PC<2.5"),
    "b365": ("B365C>2.5", "B365C<2.5"),
}


def _download(force: bool) -> list[Path]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for div, code in all_targets():
        dest = RAW_DIR / f"{div}_{code}.csv"
        if force or not dest.exists() or dest.stat().st_size == 0:
            url = csv_url(div, code)
            req = urllib.request.Request(url, headers={"User-Agent": "mtj-backtest/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (URL maîtrisée)
                dest.write_bytes(r.read())
        paths.append(dest)
    return paths


def _read_csv(path: Path) -> pd.DataFrame:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            df = pd.read_csv(path, encoding=enc, on_bad_lines="skip")
            break
        except (UnicodeDecodeError, pd.errors.ParserError):
            continue
    else:
        raise RuntimeError(f"Illisible : {path}")
    # Colonnes fantômes en fin de ligne (virgules traînantes).
    df = df.loc[:, [c for c in df.columns if not str(c).startswith("Unnamed")]]
    df = df.dropna(how="all")
    if "Date" in df.columns:
        df = df[df["Date"].notna() & df.get("HomeTeam").notna()]
    return df


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    return pd.to_numeric(df[name], errors="coerce") if name in df.columns else pd.Series(np.nan, index=df.index)


def load(force: bool = False) -> None:
    div_code = _download(force)
    print(f"Source : {data_source()}  ·  {len(div_code)} fichiers\n")

    frames: list[pd.DataFrame] = []
    for div, code in all_targets():
        path = RAW_DIR / f"{div}_{code}.csv"
        df = _read_csv(path)
        name, country = LEAGUES[div]
        meta = pd.DataFrame(
            {
                "league_code": div,
                "league_name": name,
                "country": country,
                "season_code": code,
                "season_label": SEASONS[code]["label"],
            },
            index=df.index,
        )
        frames.append(pd.concat([meta, df], axis=1))

    raw = pd.concat(frames, ignore_index=True, sort=False)

    # ---- Table propre, typée, prête pour le modèle ------------------------
    date = pd.to_datetime(raw["Date"], dayfirst=True, errors="coerce")
    clean = pd.DataFrame(
        {
            "season_code": raw["season_code"],
            "season_label": raw["season_label"],
            "league_code": raw["league_code"],
            "league_name": raw["league_name"],
            "country": raw["country"],
            "date": date.dt.strftime("%Y-%m-%d"),
            "home": raw["HomeTeam"].astype("string").str.strip(),
            "away": raw["AwayTeam"].astype("string").str.strip(),
            "fthg": _col(raw, "FTHG").astype("Int64"),
            "ftag": _col(raw, "FTAG").astype("Int64"),
            "ftr": raw.get("FTR"),
        }
    )
    for tag, (h, d, a) in CLOSE_1X2.items():
        clean[f"close_{tag}_h"] = _col(raw, h)
        clean[f"close_{tag}_d"] = _col(raw, d)
        clean[f"close_{tag}_a"] = _col(raw, a)
    for tag, (o, u) in CLOSE_OU25.items():
        clean[f"close_{tag}_o25"] = _col(raw, o)
        clean[f"close_{tag}_u25"] = _col(raw, u)

    # On ne garde que des matchs joués (résultat connu).
    clean = clean[clean["date"].notna() & clean["fthg"].notna() & clean["ftag"].notna()]
    clean = clean.sort_values(["date", "league_code", "home"]).reset_index(drop=True)
    clean.insert(0, "match_id", range(1, len(clean) + 1))

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as con:
        raw.to_sql("matches_raw", con, if_exists="replace", index=False)
        clean.to_sql("matches", con, if_exists="replace", index=False)
        con.execute("CREATE INDEX IF NOT EXISTS matches_date_idx ON matches(date)")
        con.execute("CREATE INDEX IF NOT EXISTS matches_league_idx ON matches(league_code, season_code)")

    _summary(clean, raw)


def _summary(clean: pd.DataFrame, raw: pd.DataFrame) -> None:
    print(f"Base : {DB_PATH}")
    print(f"Matchs chargés : {len(clean):,}  ·  colonnes brutes conservées : {raw.shape[1]}\n")

    print("Matchs par championnat × saison")
    piv = clean.pivot_table(index="league_name", columns="season_label", values="match_id", aggfunc="count", fill_value=0)
    piv["Total"] = piv.sum(axis=1)
    print(piv.to_string())
    print(f"\n{'':<16}Total général : {len(clean):,} matchs")

    print("\nFenêtre de dates par saison")
    for code, s in SEASONS.items():
        sub = clean[clean["season_code"] == code]
        print(f"  {s['label']:<12} {sub['date'].min()} → {sub['date'].max()}  ({len(sub):,} matchs)")

    print("\nCouverture des cotes de clôture (non nulles)")
    n = len(clean)
    checks = [
        ("1X2 — moyenne marché (AvgC)", "close_avg_h"),
        ("1X2 — Pinnacle (PSC)", "close_ps_h"),
        ("1X2 — Bet365 (B365C)", "close_b365_h"),
        ("Plus/Moins 2,5 — moyenne (AvgC)", "close_avg_o25"),
        ("Plus/Moins 2,5 — Pinnacle (PC)", "close_ps_o25"),
    ]
    for label, col in checks:
        c = int(clean[col].notna().sum())
        print(f"  {label:<34} {c:>6,} / {n:,}  ({100 * c / n:.1f} %)")

    print("\nRésultats bruts (contrôle) — répartition FTR")
    print("  " + "  ".join(f"{k}={v}" for k, v in clean["ftr"].value_counts().items()))
    goals = (clean["fthg"] + clean["ftag"]).astype(float)
    print(f"  Buts par match : moyenne {goals.mean():.2f}, médiane {goals.median():.0f}, max {int(goals.max())}")

    print("\nÉchantillon (5 matchs, cotes de clôture moyenne marché)")
    cols = ["date", "league_code", "home", "away", "fthg", "ftag", "ftr", "close_avg_h", "close_avg_d", "close_avg_a", "close_avg_o25", "close_avg_u25"]
    print(clean[cols].head(5).to_string(index=False))


def main() -> None:
    ap = argparse.ArgumentParser(description="Étape 1 — chargement des données historiques.")
    ap.add_argument("--force", action="store_true", help="re-télécharge les CSV même s'ils sont en cache")
    args = ap.parse_args()
    load(force=args.force)


if __name__ == "__main__":
    main()
