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


def check() -> list[str]:
    """Renvoie la liste des alertes (vide si tout est frais)."""
    alerts: list[str] = []
    with connect() as con, con.cursor() as cur:
        for job, budget in STALE_AFTER.items():
            cur.execute(
                """select max(termine_le) from pipeline_runs
                    where job = %s and statut = 'success'""",
                (job,),
            )
            last = cur.fetchone()[0]
            cur.execute("select now()")
            now = cur.fetchone()[0]
            if last is None:
                alerts.append(f"{job} : aucune exécution réussie enregistrée.")
            elif now - last > budget:
                age = now - last
                alerts.append(f"{job} : dernière réussite il y a {age} (> {budget}).")
            else:
                print(f"{job:<10} OK — dernière réussite {last:%Y-%m-%d %H:%M UTC}")
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
