"""
diag_fixtures.py — SONDE en lecture seule : que contient VRAIMENT `fixtures` ?

On ne suppose plus, on regarde. Pour une liste de noms d'équipes (par défaut ceux
du ticket de test, surchargeable via MTJ_DIAG_TEAMS="reims,dunkerque,..."), affiche
chaque match trouvé avec :
  - le championnat, l'ORDRE domicile/extérieur TEL QU'IL EST STOCKÉ,
  - la date_utc exacte, le statut,
  - si la date est future et si elle tombe dans la fenêtre d'analyse (21 j).
Plus : l'heure now() UTC de la base, le nombre de matchs par championnat, et les
erreurs du dernier run collecteur (pour voir un éventuel rollback par ligue).

Aucune écriture. Répond aux trois questions : le match est-il en base ? à quelle
date ? dans quel ORDRE ? et le collecteur a-t-il échoué quelque part ?
"""
from __future__ import annotations

import os

from .db import connect

DEFAULT_TEAMS = [
    "reims", "dunkerque", "sporting", "vitoria", "guimaraes", "guingamp", "boulogne",
    "nancy", "montpellier", "grenoble", "etienne", "corum", "belediyespor", "galatasaray",
    "lens", "paris",
]


def _patterns() -> list[str]:
    raw = os.environ.get("MTJ_DIAG_TEAMS", "").strip()
    noms = [x.strip() for x in raw.split(",") if x.strip()] if raw else DEFAULT_TEAMS
    return [f"%{n}%" for n in noms]


def main() -> None:
    pats = _patterns()
    with connect() as con, con.cursor() as cur:
        cur.execute("select now()")
        now = cur.fetchone()[0]
        print(f"Heure base (now(), UTC) : {now}\n")

        cur.execute(
            """
            select l.provider_ref, th.nom as home, ta.nom as away,
                   f.date_utc, f.statut,
                   (f.date_utc >= now()) as futur,
                   (f.date_utc >= now() and f.date_utc < now() + interval '21 days') as dans_fenetre
              from fixtures f
              join teams th on th.id = f.team_home_id
              join teams ta on ta.id = f.team_away_id
              join leagues l on l.id = f.league_id
             where th.nom ilike any(%s) or ta.nom ilike any(%s)
             order by f.date_utc
            """,
            (pats, pats),
        )
        rows = cur.fetchall()
        print(f"=== MATCHS trouvés pour les noms du ticket ({len(rows)}) ===")
        print(f"  {'ligue':<28}{'domicile':<22}{'extérieur':<22}{'date_utc':<26}{'statut':<10}futur  fenêtre")
        for pref, h, a, d, st, fut, win in rows:
            print(f"  {str(pref)[:26]:<28}{str(h)[:20]:<22}{str(a)[:20]:<22}{str(d):<26}{st:<10}"
                  f"{'oui' if fut else 'non':<7}{'oui' if win else 'non'}")
        if not rows:
            print("  (AUCUN match en base pour ces noms — problème de COLLECTE, pas de date.)")

        print("\n=== NOMBRE de matchs par championnat (top 20) ===")
        cur.execute(
            """
            select l.provider_ref, count(*) n,
                   count(*) filter (where f.date_utc >= now() and f.date_utc < now() + interval '21 days') futurs
              from fixtures f join leagues l on l.id = f.league_id
             group by l.provider_ref order by n desc limit 20
            """
        )
        for pref, n, futurs in cur.fetchall():
            print(f"  {str(pref)[:34]:<36}{n:>6} matchs  ·  {futurs:>4} dans la fenêtre")

        print("\n=== DERNIER run collecteur : erreurs par ligue (rollback éventuel) ===")
        cur.execute(
            """select detail->'erreurs', demarre_le from pipeline_runs
                where job='collector' order by demarre_le desc limit 1"""
        )
        row = cur.fetchone()
        if row and row[0]:
            print(f"  run du {row[1]} :")
            for fd, err in row[0].items():
                print(f"    {fd:<10} ÉCHEC : {str(err)[:160]}")
        else:
            print("  (aucune erreur journalisée au dernier run — pas de rollback par ligue)")


if __name__ == "__main__":
    main()
