"""
diag_teams.py — SONDE lecture seule : y a-t-il des DOUBLONS d'équipes ?

Le log a montré « candidats : Clermont, Clermont » (deux lignes pour un club) et
des matchs « non retrouvés » alors que la fixture existe. Hypothèse : le même club
existe en PLUSIEURS lignes `teams` (deux noms, ou deux compétitions), ce qui casse
la résolution — soit ambiguïté (deux candidats), soit la fixture pointe une ligne
que `matchTeam` n'a pas choisie.

Cette sonde montre, pour les clubs du ticket : toutes les lignes `teams` (id, nom,
championnat), et signale les DOUBLONS. Plus : la liste globale des clubs présents
sous plusieurs lignes. Aucune écriture.
"""
from __future__ import annotations

import os
from collections import defaultdict

from .db import connect
from .sync import canonical_key

DEFAULT = [
    "reims", "dunkerque", "clermont", "saint", "etienne", "guingamp", "boulogne",
    "lens", "paris", "nancy", "montpellier",
]


def _patterns() -> list[str]:
    raw = os.environ.get("MTJ_DIAG_TEAMS", "").strip()
    noms = [x.strip() for x in raw.split(",") if x.strip()] if raw else DEFAULT
    return [f"%{n}%" for n in noms]


def main() -> None:
    with connect() as con, con.cursor() as cur:
        cur.execute(
            """select t.id, t.nom, l.provider_ref
                 from teams t join leagues l on l.id = t.league_id
                where t.nom ilike any(%s)
                order by t.nom, l.provider_ref""",
            (_patterns(),),
        )
        rows = cur.fetchall()
        print(f"=== LIGNES teams pour les clubs du ticket ({len(rows)}) ===")
        for tid, nom, pref in rows:
            print(f"  id={tid:<7} {str(nom)[:28]:<30} {pref}")

        # Doublons GLOBAUX : plusieurs lignes pour une même clé canonique (même club).
        cur.execute(
            "select t.id, t.nom, l.provider_ref from teams t join leagues l on l.id = t.league_id"
        )
        by_key: dict[str, list[tuple]] = defaultdict(list)
        for tid, nom, pref in cur.fetchall():
            by_key[canonical_key(nom)].append((tid, nom, pref))
        dups = {k: v for k, v in by_key.items() if len({r[0] for r in v}) > 1}
        print(f"\n=== DOUBLONS (même clé canonique, plusieurs lignes) : {len(dups)} clubs ===")
        for k, v in sorted(dups.items(), key=lambda kv: -len(kv[1]))[:40]:
            details = " · ".join(f"id{tid} « {nom} » [{pref}]" for tid, nom, pref in v)
            print(f"  « {k} » → {details}")
        if not dups:
            print("  (aucun doublon par clé canonique — mais des NOMS DIFFÉRENTS pour un même")
            print("   club, comme « Reims » vs « Stade de Reims », ne sont PAS détectés ici :")
            print("   regarde la liste du haut à la main.)")


if __name__ == "__main__":
    main()
