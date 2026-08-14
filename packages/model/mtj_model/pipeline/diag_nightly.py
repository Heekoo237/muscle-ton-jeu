"""
diag_nightly.py — SONDE en lecture seule : POURQUOI 75 % des matchs en régime
MODÈLE n'ont-ils pas de probabilité ?

Le chemin modèle (compute.league_predictions) SAUTE en silence tout match dont une
équipe est inconnue du fit Dixon-Coles (`expected_goals` renvoie None → `continue`,
aucune ligne, aucune erreur). Le fit indexe les équipes par leur NOM BRUT, tel qu'il
apparaît dans l'historique (`strength.fit_league`). L'historique vient surtout du
backfill football-data ; les matchs à venir viennent d'Odds API (collecteur). Deux
référentiels de noms — exactement le problème que l'app résout avec alias + club_id,
mais que le fit ne réconcilie PAS.

Cette sonde tranche entre DEUX causes, par la donnée :
  - RÉCONCILIABLE : le nom à venir diverge de l'historique, MAIS le club a bien un
    historique sous le même `club_id` → keyer le fit par club_id récupérerait le
    modèle. On ne perd pas notre meilleure analyse, on la débloque.
  - SANS HISTORIQUE : aucune histoire même par club_id (vrai promu, ligue non
    backfillée) → là, et là seulement, la bascule en cote seule est justifiée.
  - AUTRE : le nom EST dans l'historique mais le match est quand même sans proba →
    cause distincte (fit trop mince, cote absente, bord de fenêtre) à creuser.

Identité de club = coalesce(club_id, id), comme `clubOf` côté app. Aucune écriture.
"""
from __future__ import annotations

from collections import defaultdict

from .db import connect

WINDOW_DAYS = 21

# Comptages du DERNIER run nocturne, par ligue et par source (répond au « combien de
# lignes par ligue, des erreurs ? »).
_SQL_LAST_NIGHTLY = """
    select demarre_le, statut, erreur, detail
      from pipeline_runs
     where job = 'nightly'
     order by id desc
     limit 1
"""

# Historique JOUÉ (matchs terminés) : nom + identité de club, par championnat.
_SQL_HISTORY = """
    select l.provider_ref as fd,
           th.nom, coalesce(th.club_id, th.id) as hc,
           ta.nom, coalesce(ta.club_id, ta.id) as ac
      from fixtures f
      join leagues l  on l.id = f.league_id
      join teams   th on th.id = f.team_home_id
      join teams   ta on ta.id = f.team_away_id
     where f.statut = 'finished'
"""

# Matchs à venir en régime MODÈLE, dans la fenêtre, SANS aucune prédiction.
_SQL_SKIPPED = """
    select l.provider_ref as fd, coalesce(c.nom, l.provider_ref) as champ,
           f.date_utc,
           th.nom, coalesce(th.club_id, th.id) as hc,
           ta.nom, coalesce(ta.club_id, ta.id) as ac
      from fixtures f
      join leagues l  on l.id = f.league_id
      join league_catalog c on c.fd_code = l.provider_ref
      join teams   th on th.id = f.team_home_id
      join teams   ta on ta.id = f.team_away_id
     where c.regime = 'modele'
       and f.statut = 'scheduled'
       and f.date_utc >= now()
       and f.date_utc <  now() + (%s * interval '1 day')
       and not exists (select 1 from predictions p where p.fixture_id = f.id)
     order by f.date_utc
"""


def run() -> None:
    with connect() as con, con.cursor() as cur:
        cur.execute(_SQL_LAST_NIGHTLY)
        last = cur.fetchone()
        cur.execute(_SQL_HISTORY)
        history = cur.fetchall()
        cur.execute(_SQL_SKIPPED, (WINDOW_DAYS,))
        skipped = cur.fetchall()

    # (b) Dernier nocturne : lignes par ligue et par source, erreurs.
    print("Dernier run nocturne :")
    if last:
        demarre, statut, erreur, detail = last
        print(f"  {demarre:%Y-%m-%d %H:%M UTC}  statut={statut}")
        if erreur:
            print(f"  ERREUR : {str(erreur)[:300]}")
        for fd in sorted(detail or {}):
            par_source = detail[fd]
            if isinstance(par_source, dict):
                total = sum(par_source.values())
                parts = " ".join(f"{s}={n}" for s, n in sorted(par_source.items()))
                print(f"    {fd:<8} {total:>4} lignes   ({parts})")
    else:
        print("  (aucun run nocturne enregistré)")

    # Ensembles d'historique par championnat : noms bruts et identités de club.
    hist_names: dict[str, set] = defaultdict(set)
    hist_clubs: dict[str, set] = defaultdict(set)
    for fd, hn, hc, an, ac in history:
        hist_names[fd].add(hn)
        hist_names[fd].add(an)
        hist_clubs[fd].add(hc)
        hist_clubs[fd].add(ac)

    # (c) Classement des matchs modèle sautés.
    RECONCILIABLE, SANS_HIST, AUTRE = "reconciliable", "sans_historique", "autre"

    def classe(fd, hn, hc, an, ac) -> str:
        noms_ok = hn in hist_names[fd] and an in hist_names[fd]
        clubs_ok = hc in hist_clubs[fd] and ac in hist_clubs[fd]
        if noms_ok:
            return AUTRE  # nom présent en historique mais quand même sauté → autre cause
        if clubs_ok:
            return RECONCILIABLE  # nom diverge, club en historique → club_id récupère le modèle
        return SANS_HIST  # au moins une équipe absente même par club_id

    par_classe: dict[str, int] = defaultdict(int)
    par_ligue: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    exemples: dict[str, list] = defaultdict(list)
    for fd, champ, d, hn, hc, an, ac in skipped:
        cl = classe(fd, hn, hc, an, ac)
        par_classe[cl] += 1
        par_ligue[fd][cl] += 1
        if len(exemples[cl]) < 12:
            exemples[cl].append((d, champ, hn, an))

    total = len(skipped)
    print(f"\nMatchs MODÈLE à venir SANS probabilité (fenêtre {WINDOW_DAYS} j) : {total}\n")
    print(f"  {'RÉCONCILIABLE (club en histo, nom diverge → keyer club_id)':<58}{par_classe[RECONCILIABLE]:>5}")
    print(f"  {'SANS HISTORIQUE (absent même par club_id → cote seule)':<58}{par_classe[SANS_HIST]:>5}")
    print(f"  {'AUTRE (nom en histo, cause distincte à creuser)':<58}{par_classe[AUTRE]:>5}")

    print("\nPar championnat (réconciliable / sans histo / autre) :")
    for fd in sorted(par_ligue):
        c = par_ligue[fd]
        print(f"  {fd:<10} {c[RECONCILIABLE]:>3} / {c[SANS_HIST]:>3} / {c[AUTRE]:>3}")

    for cl, titre in ((RECONCILIABLE, "RÉCONCILIABLES"), (SANS_HIST, "SANS HISTORIQUE"), (AUTRE, "AUTRES")):
        if exemples[cl]:
            print(f"\nExemples — {titre} :")
            for d, champ, hn, an in exemples[cl]:
                print(f"  {d:%m-%d %H:%M}  {str(champ)[:20]:<22}{hn[:18]} – {an[:18]}")


def main() -> None:
    run()


if __name__ == "__main__":
    main()
