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

from ..constants import (
    ALT_TOTALS_MARGIN_PCT,
    ALT_TOTALS_MIN_LEAGUES,
    ALT_TOTALS_MIN_NIGHTS,
    REPLI_ALERT,
)
from .db import connect
from .nightly import NIGHTLY_SKIP_ALERT, leagues_over_totals_margin
from .version import print_banner

# Seuils de fraîcheur par job. La nocturne tourne 1×/jour → 36 h laisse rater une
# nuit sans alerter, mais pas deux. Le collecteur tourne toutes les 6 h.
STALE_AFTER = {"nightly": timedelta(hours=36), "collector": timedelta(hours=12)}

# Une ligue sans AUCUNE cote depuis plus de 14 jours doit se voir. Au démarrage
# c'est légitime (hors-saison) : période de grâce de 14 j après le 1ᵉ collecteur.
LEAGUE_SILENCE = timedelta(days=14)

# On PRÉVIENT avant de BLOQUER. Le collecteur s'arrête si le plan dépasse le palier
# (garde-fou dur) ; ici, bien avant, on alerte dès que les restants tombent sous
# 20 % du palier détecté — un avertissement laisse le temps de réagir, un arrêt
# brutal fait perdre de l'historique. Plancher absolu si le palier est inconnu.
CREDIT_LOW_FRACTION = 0.20
CREDIT_LOW_FLOOR = 150


def credit_low_threshold(palier: int | None) -> int:
    """Seuil d'alerte crédits : 20 % du palier détecté, sinon plancher absolu."""
    if palier is None:
        return CREDIT_LOW_FLOOR
    return max(CREDIT_LOW_FLOOR, round(palier * CREDIT_LOW_FRACTION))


def _credit_budget(cur, alerts: list[str]) -> None:
    """Lit restants + palier du dernier run collecteur et alerte AVANT l'épuisement."""
    cur.execute(
        """select detail->>'credits_restants', detail->>'palier_detecte'
             from pipeline_runs
            where job = 'collector' and detail ? 'credits_restants'
            order by demarre_le desc limit 1"""
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        return
    restants = int(float(row[0]))
    palier = int(float(row[1])) if row[1] is not None else None
    seuil = credit_low_threshold(palier)
    palier_txt = f" sur un palier de {palier}" if palier is not None else ""
    if restants < seuil:
        alerts.append(
            f"crédits fournisseur bas : {restants} restants (< {seuil}, soit 20 % du "
            f"palier{palier_txt}) — abonne-toi ou réduis la fréquence avant l'arrêt."
        )
    else:
        print(f"crédits     OK — {restants} restants (seuil d'alerte {seuil}{palier_txt})")


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


def _totals_escalation(cur, alerts: list[str]) -> None:
    """Signale quand le critère d'escalade `alternate_totals` est atteint.

    Lit les `totals_2_5_books` des derniers nocturnes. Le 2,5 gratuit devient
    cher si sa marge OU dépasse le seuil sur trop de ligues, DURABLEMENT : on
    n'alerte que si la largeur (> N ligues) tient sur les N dernières nuits.
    """
    cur.execute(
        """select detail->'totals_2_5_books'
             from pipeline_runs
            where job = 'nightly' and detail ? 'totals_2_5_books'
            order by demarre_le desc limit %s""",
        (ALT_TOTALS_MIN_NIGHTS,),
    )
    nights = [r[0] if isinstance(r[0], dict) else json.loads(r[0]) for r in cur.fetchall()]
    if len(nights) < ALT_TOTALS_MIN_NIGHTS:
        return  # pas encore assez d'historique pour juger la durabilité
    counts = [len(leagues_over_totals_margin(n, ALT_TOTALS_MARGIN_PCT)) for n in nights]
    if all(c > ALT_TOTALS_MIN_LEAGUES for c in counts):
        alerts.append(
            f"escalade totals : > {ALT_TOTALS_MIN_LEAGUES} ligues au-dessus de "
            f"{ALT_TOTALS_MARGIN_PCT:.0f}% de marge OU-2,5 sur {ALT_TOTALS_MIN_NIGHTS} nocturnes "
            f"(dernier : {counts[0]} ligues) — envisager alternate_totals (voir README)."
        )
    else:
        print(f"escalade    OK — marge 2,5 sous le critère d'escalade sur {len(nights)} nuits")


def _nightly_coverage(cur, alerts: list[str]) -> None:
    """Alerte si le dernier nocturne a ABANDONNÉ une ligue en fenêtre ou sauté trop
    de matchs. Sans ça, un « success » masquait 75 % de trous côté modèle — c'est ce
    qui a laissé le problème durer invisible. Lit `couverture_resume` du dernier run.
    """
    cur.execute(
        """select detail->'couverture_resume'
             from pipeline_runs
            where job = 'nightly' and detail ? 'couverture_resume'
            order by demarre_le desc limit 1"""
    )
    row = cur.fetchone()
    if not row or row[0] is None:
        return
    resume = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    abandons = resume.get("abandons") or []
    taux = float(resume.get("taux_saut", 0))
    if abandons:
        alerts.append(
            f"nocturne : ligue(s) ABANDONNÉE(s) (matchs en fenêtre, aucune ligne) : "
            f"{', '.join(abandons)} — équipes inconnues du fit ou historique manquant."
        )
    if taux > NIGHTLY_SKIP_ALERT:
        alerts.append(
            f"nocturne : {taux:.0%} des matchs en fenêtre sautés (> {NIGHTLY_SKIP_ALERT:.0%}) "
            f"— {resume.get('sautes')}/{resume.get('fenetre')} sans probabilité."
        )
    if not abandons and taux <= NIGHTLY_SKIP_ALERT:
        print(f"couverture  OK — {resume.get('traites')}/{resume.get('fenetre')} matchs traités "
              f"({taux:.0%} sautés)")


def check() -> list[str]:
    """Renvoie la liste des alertes (vide si tout est frais)."""
    alerts: list[str] = []
    with connect() as con, con.cursor() as cur:
        _job_freshness(cur, alerts)
        _league_silence(cur, alerts)
        _credit_budget(cur, alerts)
        _repli_coverage(cur, alerts)
        _totals_escalation(cur, alerts)
        _nightly_coverage(cur, alerts)
    return alerts


def main() -> None:
    print_banner("health")
    alerts = check()
    if alerts:
        print("\nALERTE — pipeline potentiellement mort :", file=sys.stderr)
        for a in alerts:
            print("  - " + a, file=sys.stderr)
        sys.exit(1)
    print("\nTous les jobs sont frais.")


if __name__ == "__main__":
    main()
