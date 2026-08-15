"""
diag_trace.py — REMONTE LA CHAÎNE du nocturne pour des matchs précis (lecture seule).

Pour chaque match ciblé (par sous-chaîne de nom d'équipe ; défaut : les exemples du
diagnostic), on rejoue exactement ce que le nocturne fait, étape par étape, et on
montre OÙ le match sort de la chaîne :

  1. la fixture : championnat, date_utc, jours d'ici, DANS la fenêtre 7 j ? 21 j ?
  2. cotes en base : nombre, première/dernière relève (le match était-il coté, et
     depuis quand — donc existait-il au dernier nocturne ?) ;
  3. prédiction en base : présente ou non ;
  4. le fit du championnat : les deux équipes sont-elles dans l'index ? que renvoie
     `expected_goals` (le modèle SAIT-il jouer ce match) ?

Ainsi on distingue sans ambiguïté : HORS FENÊTRE (date trop loin pour la fenêtre
réellement utilisée), HORS INDEX (équipe absente du fit — promu), ou DÉJÀ CALCULABLE
mais non traité (dans l'index + coté, donc c'est la fenêtre qui l'a exclu).

Cibles surchargeables : MTJ_TRACE="marseille,strasbourg,alverca". Aucune écriture.
"""
from __future__ import annotations

import os

import pandas as pd

from ..constants import XI_PER_DAY
from ..strength import fit_league
from .db import connect
from .nightly import _fetch_history

DEFAULT_TARGETS = ["marseille", "strasbourg", "everton", "alverca", "raal", "amed", "louviere"]

_SQL_NOW_NIGHTLY = """
    select now(),
           (select max(demarre_le) from pipeline_runs where job = 'nightly')
"""

_SQL_FIXTURES = """
    select f.id, l.provider_ref as fd, coalesce(c.nom, l.provider_ref) as champ,
           th.nom as home, ta.nom as away, f.date_utc,
           (select count(*) from predictions p where p.fixture_id = f.id) as npred,
           (select count(*) from odds_snapshots o where o.fixture_id = f.id) as nodds,
           (select min(o.releve_le) from odds_snapshots o where o.fixture_id = f.id) as premiere_cote
      from fixtures f
      join leagues l on l.id = f.league_id
      left join league_catalog c on c.fd_code = l.provider_ref
      join teams th on th.id = f.team_home_id
      join teams ta on ta.id = f.team_away_id
     where f.statut = 'scheduled'
       and f.date_utc >= now()
       and (lower(th.nom) like %s or lower(ta.nom) like %s)
     order by f.date_utc
     limit 6
"""


def _targets() -> list[str]:
    raw = os.environ.get("MTJ_TRACE", "").strip()
    return [t.strip().lower() for t in raw.split(",") if t.strip()] or DEFAULT_TARGETS


def run() -> None:
    targets = _targets()
    with connect() as con:
        with con.cursor() as cur:
            cur.execute(_SQL_NOW_NIGHTLY)
            now, derniere_nocturne = cur.fetchone()
            seen: set[int] = set()
            fixtures: list[tuple] = []
            for t in targets:
                cur.execute(_SQL_FIXTURES, (f"%{t}%", f"%{t}%"))
                for row in cur.fetchall():
                    if row[0] not in seen:
                        seen.add(row[0])
                        fixtures.append(row)
        # Historique complet une fois, puis fit PAR championnat concerné.
        history = _fetch_history(con)

    print(f"now (base) = {now:%Y-%m-%d %H:%M UTC}")
    print(f"dernier nocturne = {derniere_nocturne:%Y-%m-%d %H:%M UTC}" if derniere_nocturne else
          "dernier nocturne = (aucun)")
    if not fixtures:
        print("Aucune fixture à venir ne correspond aux cibles.")
        return

    ref_date = pd.Timestamp(now.date())
    fits: dict[str, object] = {}

    def fit_for(fd: str):
        if fd in fits:
            return fits[fd]
        hist = history[history["league_code"] == fd] if not history.empty else history
        if hist.empty or hist["home"].nunique() < 4:
            fits[fd] = None
        else:
            fits[fd] = fit_league(hist, ref_date, XI_PER_DAY)
        return fits[fd]

    for fid, fd, champ, home, away, date_utc, npred, nodds, premiere in fixtures:
        jours = (date_utc - now).days + ((date_utc - now).seconds > 0)
        print(f"\n── {home} – {away}  ({champ}, {fd})  fixture {fid}")
        print(f"   date_utc={date_utc:%Y-%m-%d %H:%M}  → dans {jours} j  "
              f"[fenêtre 7 j: {'OUI' if jours <= 7 else 'NON'} · 21 j: {'OUI' if jours <= 21 else 'NON'}]")
        cote_txt = f"{nodds} cotes"
        if premiere:
            cote_txt += f", première relève {premiere:%m-%d %H:%M}"
            if derniere_nocturne:
                cote_txt += " (AVANT" if premiere < derniere_nocturne else " (APRÈS"
                cote_txt += " le dernier nocturne)"
        print(f"   cotes={cote_txt}   prédiction en base={'OUI' if npred else 'NON'}")

        fit = fit_for(fd)
        if fit is None:
            print("   fit: NON ajustable (historique insuffisant pour ce championnat)")
            continue
        idx = getattr(fit, "index", {})
        hin, ain = home in idx, away in idx
        print(f"   fit: {home!r} dans l'index={hin} · {away!r} dans l'index={ain}")
        if hin and ain:
            eg = fit.expected_goals(home, away)
            print(f"   expected_goals → {eg}  ⇒ le modèle SAIT jouer ce match "
                  f"(seule la fenêtre a pu l'exclure)")
        else:
            manquants = [n for n, present in ((home, hin), (away, ain)) if not present]
            print(f"   expected_goals → None (équipe hors index : {', '.join(manquants)})")
            # Aide au diagnostic nom : quelques équipes proches dans l'index.
            for nom in manquants:
                pref = nom.split()[0][:4].lower()
                proches = [t for t in idx if pref in t.lower()][:4]
                print(f"      « {nom} » absent — proches dans l'historique : {proches or '—'}")


def main() -> None:
    run()


if __name__ == "__main__":
    main()
