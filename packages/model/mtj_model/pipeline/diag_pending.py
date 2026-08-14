"""
diag_pending.py — SONDE en lecture seule : combien de matchs à venir sont COTÉS
mais SANS probabilité en base ?

C'est l'écart collecte / nocturne, mesuré et non supposé. Le collecteur relève les
cotes plusieurs fois par jour ; le nocturne calcule les probabilités une fois par
nuit. Entre les deux, un match coté n'a pas encore de ligne dans `predictions` —
l'utilisateur voit « pas encore de données » pour un match pourtant coté.

On regarde la fenêtre d'analyse (21 j, identique au nocturne et à l'app), et on
range chaque match à venir dans un état :
  - avec_pred        : au moins une ligne `predictions` (n'importe quel jour) → analysable
  - cote_sans_pred   : des cotes en base mais AUCUNE prédiction → L'ÉCART À MESURER
  - ni_cote_ni_pred  : pas encore collecté (ni cote ni prédiction)
Le tout VENTILÉ PAR RÉGIME (cote_seule vs modèle) : la ventilation décide si le
collecteur peut combler l'écart tout seul (cote seule = dévigeage déterministe,
aucun modèle à ajuster) ou s'il faut le nocturne (modèle = ajustement Dixon-Coles).

« avec prédiction » suit exactement la lecture de l'app (`predictions.get` prend la
ligne la plus récente, tous jours confondus) : une prédiction même ancienne compte.

Aucune écriture.
"""
from __future__ import annotations

from .db import connect

# Fenêtre d'analyse — DOIT rester égale à DEFAULT_DAYS (nightly.py) et à
# ANALYSIS_WINDOW_DAYS (apps/web/.../window.ts). On mesure exactement ce que l'app
# tente de résoudre, ni plus ni moins.
WINDOW_DAYS = 21

# Ventilation par état et régime des matchs à venir dans la fenêtre. `a_pred` =
# existe une ligne predictions (tous jours confondus, comme l'app). `a_cote` =
# existe un snapshot de cote. Le régime vient de league_catalog (cote_seule/modele) ;
# NULL si le championnat n'est pas au catalogue (hors couverture).
_SQL_VENTIL = """
    with fen as (
        select f.id,
               coalesce(c.regime, 'hors_catalogue') as regime,
               exists(select 1 from predictions p where p.fixture_id = f.id)    as a_pred,
               exists(select 1 from odds_snapshots o where o.fixture_id = f.id) as a_cote
          from fixtures f
          join leagues l on l.id = f.league_id
          left join league_catalog c on c.fd_code = l.provider_ref
         where f.statut = 'scheduled'
           and f.date_utc >= now()
           and f.date_utc <  now() + (%s * interval '1 day')
    )
    select regime,
           count(*)                                                as total,
           count(*) filter (where a_pred)                          as avec_pred,
           count(*) filter (where not a_pred and a_cote)           as cote_sans_pred,
           count(*) filter (where not a_pred and not a_cote)       as ni_cote_ni_pred
      from fen
     group by regime
     order by regime
"""

# Fraîcheur des jobs : quand a tourné le dernier nocturne et le dernier collecteur ?
# L'écart n'a de sens qu'à la lumière de « depuis combien de temps le nocturne n'a
# pas tourné ».
_SQL_RUNS = """
    select job, statut, demarre_le, termine_le
      from pipeline_runs
     where job in ('nightly', 'collector')
       and id in (
         select max(id) from pipeline_runs where job in ('nightly', 'collector') group by job
       )
     order by job
"""

# Les 10 plus proches matchs cotés mais sans prédiction : pour VOIR les cas concrets
# (échéance imminente = priorité), pas seulement un total abstrait.
_SQL_EXEMPLES = """
    select coalesce(c.regime, 'hors_catalogue') as regime,
           coalesce(c.nom, l.provider_ref) as championnat,
           th.nom, ta.nom, f.date_utc
      from fixtures f
      join leagues l on l.id = f.league_id
      join teams th on th.id = f.team_home_id
      join teams ta on ta.id = f.team_away_id
      left join league_catalog c on c.fd_code = l.provider_ref
     where f.statut = 'scheduled'
       and f.date_utc >= now()
       and f.date_utc <  now() + (%s * interval '1 day')
       and exists(select 1 from odds_snapshots o where o.fixture_id = f.id)
       and not exists(select 1 from predictions p where p.fixture_id = f.id)
     order by f.date_utc
     limit 10
"""


def run() -> None:
    with connect() as con, con.cursor() as cur:
        cur.execute(_SQL_VENTIL, (WINDOW_DAYS,))
        rows = cur.fetchall()
        cur.execute(_SQL_RUNS)
        runs = cur.fetchall()
        cur.execute(_SQL_EXEMPLES, (WINDOW_DAYS,))
        exemples = cur.fetchall()

    print(f"Écart collecte / nocturne — matchs à venir (fenêtre {WINDOW_DAYS} j)\n")
    print("Dernier passage des jobs :")
    for job, statut, demarre, termine in runs:
        quand = termine or demarre
        print(f"  {job:<10} {statut:<9} {quand:%Y-%m-%d %H:%M UTC}")
    if not runs:
        print("  (aucun run enregistré)")

    print(f"\n{'régime':<15}{'total':>7}{'avec proba':>12}{'coté sans proba':>18}{'pas collecté':>14}")
    tot = [0, 0, 0, 0]
    for regime, total, avec, cote_sans, ni in rows:
        print(f"  {regime:<13}{total:>7}{avec:>12}{cote_sans:>18}{ni:>14}")
        tot = [tot[0] + total, tot[1] + avec, tot[2] + cote_sans, tot[3] + ni]
    print(f"  {'TOTAL':<13}{tot[0]:>7}{tot[1]:>12}{tot[2]:>18}{tot[3]:>14}")

    # LE chiffre demandé, isolé et commenté.
    cote_seule_gap = next((r[3] for r in rows if r[0] == "cote_seule"), 0)
    modele_gap = next((r[3] for r in rows if r[0] == "modele"), 0)
    print(f"\nÉCART (coté mais sans probabilité) : {tot[2]} matchs")
    print(f"  dont cote seule (le collecteur pourrait combler en direct) : {cote_seule_gap}")
    print(f"  dont modèle    (nécessite le nocturne / ajustement)        : {modele_gap}")

    if exemples:
        print("\nLes plus proches, cotés mais sans probabilité :")
        for regime, champ, h, a, d in exemples:
            print(f"  {d:%m-%d %H:%M}  {regime:<13}{str(champ)[:22]:<24}{h[:16]}–{a[:16]}")


def main() -> None:
    run()


if __name__ == "__main__":
    main()
