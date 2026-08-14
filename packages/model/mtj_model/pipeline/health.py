"""Surveillance des jobs. Un pipeline mort en silence, c'est une semaine de
probabilités périmées servies aux utilisateurs.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.health

Sort en code 1 (et imprime ALERTE) si un job n'a pas réussi depuis > 36 h.
Branche cette sortie sur ton système d'alerte (cron qui mail/push si code ≠ 0).
"""
from __future__ import annotations

import json
import sys
from datetime import timedelta

from ..constants import REPLI_ALERT
from .db import connect

# Seuils de fraîcheur par job. La nocturne tourne 1×/jour → 36 h laisse rater une
# nuit sans alerter, mais pas deux. Le collecteur tourne toutes les 6 h.
STALE_AFTER = {"nightly": timedelta(hours=36), "collector": timedelta(hours=12)}

# Une ligue sans AUCUNE cote depuis plus de 14 jours doit se voir. Au démarrage
# c'est légitime (hors-saison) : période de grâce de 14 j après le 1ᵉ collecteur.
LEAGUE_SILENCE = timedelta(days=14)

# Crédits fournisseur restants sous lesquels on alerte (≈ 1,5 j au rythme réel de
# ~88/j). Laisse le temps de s'abonner avant l'épuisement du palier gratuit (500).
CREDIT_LOW = 150


def _credit_budget(cur, alerts: list[str]) -> None:
    """Lit les crédits restants du dernier run collecteur et alerte s'ils sont bas."""
    cur.execute(
        """select detail->>'credits_restants'
             from pipeline_runs
            where job = 'collector' and detail ? 'credits_restants'
            order by demarre_le desc limit 1"""
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        return
    restants = int(float(row[0]))
    if restants < CREDIT_LOW:
        alerts.append(f"crédits fournisseur bas : {restants} restants (< {CREDIT_LOW}) — pense à t'abonner.")
    else:
        print(f"crédits     OK — {restants} restants")


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


def _repli_coverage(cur, alerts: list[str]) -> None:
    """Alerte si un marché coté a retombé massivement au modèle (panne de couverture).

    Lit `repli_marches` du dernier nocturne réussi. Un 1X2 ou plus/moins 2,5 qui
    passe le seuil de repli = cotes qui manquent chez le fournisseur, pas un choix.
    """
    cur.execute(
        """select detail->'repli_marches'
             from pipeline_runs
            where job = 'nightly' and detail ? 'repli_marches'
            order by demarre_le desc limit 1"""
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        return
    marches = row[0] if isinstance(row[0], list) else json.loads(row[0])
    hot = [d for d in marches if float(d.get("taux", 0)) >= REPLI_ALERT]
    if not hot:
        print(f"repli cote  OK — aucun marché coté ≥ {REPLI_ALERT:.0%} de repli")
        return
    for d in hot:
        alerts.append(
            f"repli élevé : {d['ligue']} {d['marche']} à {float(d['taux']):.0%} de repli "
            f"({d['repli']}/{d['base']}) — cote manquante chez le fournisseur."
        )


def check() -> list[str]:
    """Renvoie la liste des alertes (vide si tout est frais)."""
    alerts: list[str] = []
    with connect() as con, con.cursor() as cur:
        _job_freshness(cur, alerts)
        _league_silence(cur, alerts)
        _credit_budget(cur, alerts)
        _repli_coverage(cur, alerts)
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
