"""Vérifications MÉCANIQUES de la carte d'alias — indépendantes du football.

Deux tests, à faire tourner à CHAQUE ajout de championnat (voir test_curated_map) :

  TEST 1 — CO-OCCURRENCE (avant fusion). Deux clubs d'un même championnat jouent
  la même saison ; un club ne joue jamais contre lui-même. Si deux noms qui
  tombent sur la même clé canonique co-occurrent dans une saison football-data,
  ce sont deux clubs distincts → la fusion est FAUSSE.

  TEST 2 — VOLUME (après fusion). Un club joue ~38 matchs (ligue à 20) ou ~34
  (à 18) par saison. Une entité fusionnée au volume anormal (~double) a mélangé
  deux clubs.

    MTJ_DATA_SOURCE=mirror python -m mtj_model.pipeline.checkmap        # test 1
    MTJ_DATABASE_URL=…        python -m mtj_model.pipeline.checkmap --volume  # test 2
"""
from __future__ import annotations

import argparse
import sys

from ..data.sources import LEAGUES, SEASONS
from .backfill import _matches
from .sync import canonical_key

# Un club joue au plus 2×(20−1)=38 matchs/saison ; au-delà de 42 = anormal.
VOLUME_MAX = 42


def _season_of(date_iso: str) -> str:
    """Saison football d'une date (année de début) : août→juillet."""
    y, m = int(date_iso[:4]), int(date_iso[5:7])
    return str(y if m >= 7 else y - 1)


def cooccurrence_violations() -> list[tuple[str, str, str, str, str]]:
    """TEST 1. Renvoie (ligue, saison, nomA, nomB, clé) pour chaque fusion fausse."""
    violations = []
    for div in LEAGUES:
        per_season: dict[str, set[str]] = {}
        for code in SEASONS:
            df = _matches(div, code)
            if df.empty:
                continue
            per_season[code] = set(df["home"].astype(str)) | set(df["away"].astype(str))
        if not per_season:
            continue
        groups: dict[str, set[str]] = {}
        for name in set().union(*per_season.values()):
            groups.setdefault(canonical_key(name), set()).add(name)
        for names in groups.values():
            names = sorted(names)
            for i in range(len(names)):
                for j in range(i + 1, len(names)):
                    for code, s in per_season.items():
                        if names[i] in s and names[j] in s:
                            violations.append((div, code, names[i], names[j], canonical_key(names[i])))
    return violations


def volume_outliers(con) -> list[tuple[str, str, int]]:
    """TEST 2. Renvoie (équipe, saison, nb_matchs) pour tout volume > VOLUME_MAX."""
    sql = """
        select t.nom, f.date_utc, 1
          from fixtures f
          join teams t on t.id in (f.team_home_id, f.team_away_id)
         where f.provider_ref like 'fd:%%'
    """
    from collections import Counter
    counts: Counter = Counter()
    with con.cursor() as cur:
        cur.execute(sql)
        for nom, date_utc, _ in cur.fetchall():
            counts[(nom, _season_of(str(date_utc)))] += 1
    return [(nom, season, n) for (nom, season), n in sorted(counts.items()) if n > VOLUME_MAX]


def main() -> None:
    ap = argparse.ArgumentParser(description="Vérifications mécaniques de la carte d'alias.")
    ap.add_argument("--volume", action="store_true", help="TEST 2 (volume, nécessite la base)")
    args = ap.parse_args()
    if args.volume:
        from .db import connect
        with connect() as con:
            outliers = volume_outliers(con)
        print("TEST 2 — VOLUME DE MATCHS (après fusion)")
        if outliers:
            print(f"⚠ {len(outliers)} équipe(s) au volume anormal (> {VOLUME_MAX}/saison) :")
            for nom, season, n in outliers:
                print(f"  {nom} — saison {season} : {n} matchs")
            sys.exit(1)
        print(f"✓ Aucun volume anormal (toutes ≤ {VOLUME_MAX}/saison).")
        return
    violations = cooccurrence_violations()
    print("TEST 1 — CO-OCCURRENCE (avant fusion)")
    if violations:
        print(f"⚠ {len(violations)} fusion(s) fausse(s) — deux clubs distincts sur une clé :")
        for div, code, a, b, key in violations:
            print(f"  {div} {code} : « {a} » + « {b} » (clé « {key} »)")
        sys.exit(1)
    print("✓ Aucune co-occurrence : aucune paire ne fusionne deux clubs d'une même saison.")


if __name__ == "__main__":
    main()
