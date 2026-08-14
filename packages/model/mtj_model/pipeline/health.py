"""Surveillance des jobs. Un pipeline mort en silence, c'est une semaine de
probabilités périmées servies aux utilisateurs.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.health

Sort en code 1 (et imprime ALERTE) si un job n'a pas réussi depuis > 36 h.
Branche cette sortie sur ton système d'alerte (cron qui mail/push si code ≠ 0).
"""
from __future__ import annotations

import sys
from datetime import timedelta

from .db import connect

# Seuils de fraîcheur par job. La nocturne tourne 1×/jour → 36 h laisse rater une
# nuit sans alerter, mais pas deux. Le collecteur tourne toutes les 6 h.
STALE_AFTER = {"nightly": timedelta(hours=36), "collector": timedelta(hours=12)}

# Une ligue sans AUCUNE cote depuis plus de 14 jours doit se voir. Au démarrage
# c'est légitime (hors-saison) : période de grâce de 14 j après le 1ᵉ collecteur.
LEAGUE_SILENCE = timedelta(days=14)


def _job_freshness(cur, alerts: list[str]) -> None:
    cur.execute("select now()")
    now = cur.fetchone()[0]
    for job, budget in STALE_AFTER.items():
        cur.execute(
            "select max(termine_le) from pipeline_runs where job = %s and statut = 'success'",
            (job,),
        )
        last = cur.fetchone()[0]
        if last is None:
            alerts.append(f"{job} : aucune exécution réussie enregistrée.")
        elif now - last > budget:
            alerts.append(f"{job} : dernière réussite il y a {now - last} (> {budget}).")
        else:
            print(f"{job:<10} OK — dernière réussite {last:%Y-%m-%d %H:%M UTC}")


def _league_silence(cur, alerts: list[str]) -> None:
    """Alerte toute ligue à 0 cote depuis > 14 jours (hors période de grâce)."""
    cur.execute("select now(), min(demarre_le) from pipeline_runs where job = 'collector'")
    now, first_run = cur.fetchone()
    if first_run is None or now - first_run < LEAGUE_SILENCE:
        print(f"Silence des ligues : période de grâce (collecte trop récente, < {LEAGUE_SILENCE.days} j).")
        return
    cur.execute(
        """select c.fd_code, max(os.releve_le) as derniere
             from league_catalog c
             left join leagues l         on l.provider_ref = c.fd_code
             left join fixtures f        on f.league_id = l.id
             left join odds_snapshots os on os.fixture_id = f.id
            group by c.fd_code
            order by c.fd_code"""
    )
    for fd_code, derniere in cur.fetchall():
        if derniere is None:
            alerts.append(f"ligue {fd_code} : AUCUNE cote depuis le début du suivi (> {LEAGUE_SILENCE.days} j).")
        elif now - derniere > LEAGUE_SILENCE:
            alerts.append(f"ligue {fd_code} : silencieuse depuis {now - derniere} (dernière cote {derniere:%Y-%m-%d}).")


def check() -> list[str]:
    """Renvoie la liste des alertes (vide si tout est frais)."""
    alerts: list[str] = []
    with connect() as con, con.cursor() as cur:
        _job_freshness(cur, alerts)
        _league_silence(cur, alerts)
    return alerts


def main() -> None:
    alerts = check()
    if alerts:
        print("\nALERTE — pipeline potentiellement mort :", file=sys.stderr)
        for a in alerts:
            print("  - " + a, file=sys.stderr)
        sys.exit(1)
    print("\nTous les jobs sont frais.")


if __name__ == "__main__":
    main()
