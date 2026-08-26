"""Surveillance des jobs. Un pipeline mort en silence, c'est une semaine de
probabilités périmées servies aux utilisateurs.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.health

Sort en code 1 (et imprime ALERTE) si un job n'a pas réussi depuis > 36 h.

DEUX canaux d'alerte, l'un ne remplace pas l'autre :
  1. sortie en code 1 → GitHub envoie un email « Run failed » (filet de sécurité,
     mais générique : il ne dit jamais QUOI a échoué) ;
  2. `alerts_email.envoyer_alerte` → email best-effort avec le MOTIF en objet
     (« orientation : 18 fixtures retournées »), si MTJ_ALERT_EMAIL_* est configuré.
     Absent → on saute proprement, le canal 1 reste.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

import psycopg

from ..constants import (
    ALT_TOTALS_MARGIN_PCT,
    ALT_TOTALS_MIN_LEAGUES,
    ALT_TOTALS_MIN_NIGHTS,
    REPLI_ALERT,
    REPLI_PROMU_ALERT,
    REPLI_PROMU_MIN_MATCHS,
    REPLI_PROMU_MIN_RUNS,
    REFUS_ALERT,
    REFUS_MIN_TENTATIVES,
    VISION_INCOMPLETE_ALERT,
    VISION_INCOMPLETE_MIN_LIGNES,
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


def repli_promu_offenders(couvertures: list[dict]) -> list[dict]:
    """Championnats MODÈLE au-delà du seuil de repli promu, agrégés sur les
    `couverture` fournies (un mois de nocturnes). Fonction PURE (testable sans base).

    Ne compte QUE les ligues modèle en fenêtre (repli_promu / fenêtre), et n'alerte
    qu'avec assez d'échantillon (runs + matchs cumulés) : un run isolé de début de
    saison ne doit pas déclencher. Renvoie une liste triée {fd, taux, repli, fen, runs}.
    """
    acc: dict[str, dict] = defaultdict(lambda: {"repli": 0, "fen": 0, "runs": 0})
    for cov in couvertures:
        for fd, c in (cov or {}).items():
            if not isinstance(c, dict) or c.get("regime") != "modele":
                continue
            if int(c.get("fenetre", 0)) == 0:
                continue  # ligue hors fenêtre (pré-saison) : pas d'observation
            acc[fd]["repli"] += int(c.get("repli_promu", 0))
            acc[fd]["fen"] += int(c.get("fenetre", 0))
            acc[fd]["runs"] += 1
    chauds = []
    for fd, a in acc.items():
        if a["runs"] < REPLI_PROMU_MIN_RUNS or a["fen"] < REPLI_PROMU_MIN_MATCHS:
            continue  # pas assez d'échantillon pour trancher
        taux = a["repli"] / a["fen"]
        if taux > REPLI_PROMU_ALERT:
            chauds.append({"fd": fd, "taux": taux, "repli": a["repli"],
                           "fen": a["fen"], "runs": a["runs"]})
    return sorted(chauds, key=lambda d: -d["taux"])


def _repli_promu_rate(cur, alerts: list[str]) -> None:
    """Alerte si un championnat MODÈLE dépasse le seuil de repli promu sur un MOIS
    GLISSANT — agrège les `couverture` des nocturnes des 30 derniers jours."""
    cur.execute(
        """select detail->'couverture'
             from pipeline_runs
            where job = 'nightly' and demarre_le > now() - interval '30 days'
              and detail ? 'couverture'"""
    )
    couvertures = [
        (cov if isinstance(cov, dict) else json.loads(cov or "{}")) for (cov,) in cur.fetchall()
    ]
    chauds = repli_promu_offenders(couvertures)
    for d in chauds:
        alerts.append(
            f"nocturne : {d['fd']} à {d['taux']:.0%} de repli promu sur 30 j "
            f"({d['repli']}/{d['fen']} matchs, {d['runs']} runs) — trop d'équipes hors "
            f"modèle ; vérifie l'historique du championnat (promus non backfillés ?)."
        )
    if couvertures and not chauds:
        print(f"repli promu OK — aucun championnat modèle ≥ {REPLI_PROMU_ALERT:.0%} sur 30 j")


def vision_incomplete_alert(lignes: int, incompletes: int) -> str | None:
    """Message d'alerte si le taux de lectures incomplètes dépasse le seuil sur la
    journée, ou None. Fonction PURE (testable). Sous garde-fou d'échantillon."""
    if lignes < VISION_INCOMPLETE_MIN_LIGNES:
        return None
    taux = incompletes / lignes
    if taux > VISION_INCOMPLETE_ALERT:
        return (
            f"vision : {taux:.0%} de lectures incomplètes aujourd'hui "
            f"({incompletes}/{lignes} lignes, > {VISION_INCOMPLETE_ALERT:.0%}) — la lecture "
            f"des issues dérive ; vérifie le prompt vision ou le fournisseur."
        )
    return None


def _vision_incomplete_rate(cur, alerts: list[str]) -> None:
    """Alerte si le taux de lectures VISION incomplètes du jour dépasse le seuil.
    Lit le seau quotidien `vision_stats` alimenté par l'app (record_vision_read)."""
    try:
        cur.execute("select lignes, incompletes from vision_stats where jour = current_date")
    except Exception:  # noqa: BLE001 — table absente (migration non appliquée) : on saute
        return
    row = cur.fetchone()
    if not row:
        return
    lignes, incompletes = int(row[0]), int(row[1])
    msg = vision_incomplete_alert(lignes, incompletes)
    if msg:
        alerts.append(msg)
    elif lignes >= VISION_INCOMPLETE_MIN_LIGNES:
        print(f"vision      OK — {incompletes}/{lignes} lectures incomplètes aujourd'hui")


def vision_refus_alert(tentatives: int, refus_contenu: int) -> str | None:
    """Message d'alerte si le taux de REFUS de lecture dépasse le seuil sur la
    journée, ou None. Fonction PURE (testable). Sous garde-fou d'échantillon.
    Refus « à la porte » = un utilisateur qui n'entre pas et ne se plaint pas."""
    if tentatives < REFUS_MIN_TENTATIVES:
        return None
    taux = refus_contenu / tentatives
    if taux > REFUS_ALERT:
        return (
            f"vision : {taux:.0%} de refus de lecture aujourd'hui "
            f"({refus_contenu}/{tentatives} tentatives, > {REFUS_ALERT:.0%}) — des tickets "
            f"refusés À LA PORTE ; vérifie la compression client, l'intégrité des envois "
            f"ou le fournisseur vision."
        )
    return None


def _vision_refus_rate(cur, alerts: list[str]) -> None:
    """Alerte si le taux de refus « contenu » (pas_un_ticket / illisible / incomplete)
    du jour dépasse le seuil. Lit `vision_refus` (par raison) et `vision_stats`
    (lectures réussies) — les deux seaux quotidiens alimentés par l'app."""
    try:
        cur.execute("select raison, n from vision_refus where jour = current_date")
        refus = {str(r[0]): int(r[1]) for r in cur.fetchall()}
        cur.execute(
            "select coalesce(tickets, 0), coalesce(uploads_essai2_echec, 0) "
            "from vision_stats where jour = current_date"
        )
        row = cur.fetchone()
    except Exception:  # noqa: BLE001 — table/colonne absente (migration non appliquée) : on saute
        return
    lus = int(row[0]) if row else 0
    upload_echec = int(row[1]) if row else 0
    # « Bloqué à la porte » = vrai « pas un ticket » + upload échoué MALGRÉ le réessai.
    # L'incomplet rattrapé par l'essai 2 n'est pas un refus, il ne compte pas ici.
    contenu = refus.get("pas_un_ticket", 0) + refus.get("illisible", 0) + upload_echec
    tentatives = lus + contenu
    msg = vision_refus_alert(tentatives, contenu)
    if msg:
        alerts.append(msg)
    elif tentatives >= REFUS_MIN_TENTATIVES:
        print(f"refus vision OK — {contenu}/{tentatives} tickets refusés à la porte aujourd'hui")


def _schema_manifest_path() -> Path:
    """packages/model/mtj_model/pipeline/health.py → packages/db/schema_manifest.json."""
    return Path(__file__).resolve().parents[3] / "db" / "schema_manifest.json"


def _schema_drift(alerts: list[str]) -> None:
    """Décalage code/base : un objet que le code EXIGE mais que la base n'a pas =
    une migration non appliquée → 500 côté app, découvert par l'utilisateur. On lit
    le manifeste (source de vérité unique) et on interroge `verifier_schema` (0019).

    Connexion ISOLÉE : si le moteur est absent, la transaction avortée ne doit pas
    contaminer les autres contrôles. Rien à écrire (lecture seule)."""
    path = _schema_manifest_path()
    try:
        manifest = path.read_text(encoding="utf-8")
    except OSError:
        return  # pas de manifeste dans cet environnement : rien à vérifier
    try:
        with connect() as con, con.cursor() as cur:
            cur.execute("select objet, migration from verifier_schema(%s::jsonb)", (manifest,))
            rows = cur.fetchall()
    except psycopg.errors.UndefinedFunction:
        alerts.append(
            "schéma : fonction verifier_schema (migration 0019) absente — surveillance "
            "du décalage code/base INACTIVE. Applique 0019."
        )
        return
    for objet, migration in rows:
        alerts.append(f"schéma : Manquant : {objet} (migration {migration})")
    if not rows:
        print(f"schéma      OK — {path.name} aligné avec la base")


# Rafraîchissement des scores : une ligue peut échouer une nuit (aléa réseau) sans
# alerter ; une ligue qui échoue de façon RÉCURRENTE (≥ 2 des 3 dernières nuits) est un
# vrai problème (clé de sport morte, alias en collision) — et chaque nuit ratée risque
# de faire tomber un match hors de la fenêtre /scores (score perdu). On alerte alors.
SCORES_ECHEC_NUITS = 3
SCORES_ECHEC_MIN = 2


def recurrent_score_failures(nights: list[dict]) -> dict[str, int]:
    """Ligues présentes dans les `scores_echecs` d'au moins SCORES_ECHEC_MIN des nuits
    fournies → {fd_code: nb de nuits en échec}. PURE (testable sans base)."""
    compte: dict[str, int] = {}
    for n in nights:
        for fd in (n or {}).keys():
            compte[fd] = compte.get(fd, 0) + 1
    return {fd: c for fd, c in compte.items() if c >= SCORES_ECHEC_MIN}


# ── Orientation des fixtures (fixture retourné) ──────────────────────────────
# Un match sur cinq a été trouvé inversé (fixture home/away à l'envers des cotes),
# d'où « le PSG affiché perdant ». Le dégel de l'upsert corrige la cause ; cette
# surveillance CRIE si ça remonte. Signal : la double chance MODÈLE (orientée par le
# fixture) et le 1X2 CoTÉ (orienté par le fournisseur) désignent des favoris opposés
# → écart énorme entre DC_HOME_DRAW (model) et WIN_HOME+DRAW (odds). Seuil 0,25 :
# sépare franchement le désaccord modèle/marché (< 0,15) du retournement.
FLIP_ECART = 0.25
# Un retournement isolé peut apparaître le temps d'un relevé fournisseur incohérent ;
# on n'alerte qu'au-delà d'une poignée, pour ne pas crier sur un transitoire.
FLIP_ALERT_MIN = 3
# Fraîcheur de la double chance modèle. Le nocturne tourne 1×/jour : une DC recalculée
# il y a moins de ~26 h a « vu » l'orientation courante. Au-delà, elle est PÉRIMÉE
# (calculée avant une correction d'orientation, pas encore rejouée) — pas un bug en
# cours, une dette que le prochain nocturne solde.
FLIP_FRESH_HEURES = 26


# POURQUOI TROIS SEAUX, PAS UN. L'écart DC modèle vs 1X2 coté ne détecte PAS une
# inversion « statique » : si le fixture est à l'envers, le modèle ET les cotes le
# lisent à l'envers ENSEMBLE — ils s'accordent, aucun écart. L'écart n'apparaît que
# sur une divergence TEMPORELLE : une DC modèle périmée (orientation d'AVANT) face à
# des cotes fraîches (orientation d'APRÈS). D'où trois cas, un seul grave :
#   - ACTIF  : match à venir, DC FRAÎCHE (le nocturne l'a vue) et pourtant en écart →
#              anomalie réelle (orientation ou modèle) → ALERTE.
#   - PÉRIMÉ : match à venir, DC vieille → le nocturne n'a pas encore rejoué → INFO.
#   - PASSÉ  : match déjà joué → réglé au score, pas montré → IGNORÉ.
def orientation_flip_alert(n_actif: int, seuil: int = FLIP_ALERT_MIN) -> str | None:
    """Message d'alerte pour les fixtures RÉELLEMENT retournés (actifs). PURE."""
    if n_actif < seuil:
        return None
    return (
        f"orientation : {n_actif} fixture(s) RÉELLEMENT retourné(s) — à venir, double "
        f"chance modèle FRAÎCHE et 1X2 coté désignent des favoris opposés (écart ≥ "
        f"{FLIP_ECART}, « favori affiché perdant »). Ce n'est pas une DC périmée. "
        f"Vérifie le dégel de l'upsert et /api/health/coherence."
    )


def _orientation_flip(cur, alerts: list[str]) -> None:
    """Trie les fixtures en écart DC/1X2 en trois seaux (actif / périmé / passé).
    Seuls les ACTIFS (à venir, DC fraîche) alertent ; les périmés/passés sont de
    l'info — pour ne plus crier sur une dette que le nocturne solde tout seul."""
    cur.execute(
        """
        with latest as (
            select distinct on (fixture_id, marche)
                   fixture_id, marche, probabilite, source, calcule_le
              from predictions
             where marche in ('WIN_HOME','DRAW','DC_HOME_DRAW')
             order by fixture_id, marche, jour_calcul desc
        ),
        piv as (
            select fixture_id,
                   max(probabilite) filter (where marche='WIN_HOME')      as wh,
                   max(probabilite) filter (where marche='DRAW')          as dr,
                   max(probabilite) filter (where marche='DC_HOME_DRAW')  as dc,
                   max(source::text) filter (where marche='DC_HOME_DRAW') as dc_src,
                   max(calcule_le)  filter (where marche='DC_HOME_DRAW')  as dc_calc
              from latest group by fixture_id
        ),
        flips as (
            select f.date_utc,
                   f.date_utc > now()                              as futur,
                   piv.dc_calc >= now() - (%s * interval '1 hour') as frais
              from piv join fixtures f on f.id = piv.fixture_id
             where f.date_utc between now() - (7 * interval '1 day')
                                  and now() + (14 * interval '1 day')
               and piv.dc_src = 'model'
               and piv.wh is not null and piv.dr is not null and piv.dc is not null
               and abs(piv.dc - (piv.wh + piv.dr)) >= %s
        )
        select
            count(*) filter (where futur and frais)         as actifs,
            count(*) filter (where futur and not frais)     as perimees,
            count(*) filter (where not futur)               as passes
          from flips
        """,
        (FLIP_FRESH_HEURES, FLIP_ECART),
    )
    actifs, perimees, passes = (int(x or 0) for x in cur.fetchone())
    msg = orientation_flip_alert(actifs)
    if msg:
        alerts.append(msg)
    else:
        print(f"orientation OK — {actifs} réellement retourné(s) (seuil {FLIP_ALERT_MIN})")
    # Info, jamais une alerte : la dette résiduelle que le nocturne rattrape, et les
    # matchs passés (réglés au score). On les DIT, sans lever exit 1 pour eux.
    if perimees or passes:
        print(f"  (info orientation : {perimees} DC périmée(s) à venir — nocturne rattrape ; "
              f"{passes} match(s) passé(s) ignoré(s).)")


def _scores_refresh_failures(cur, alerts: list[str]) -> None:
    """Alerte si une ligue rate le rafraîchissement de ses scores de façon récurrente.
    Lit `scores_echecs` des derniers nocturnes (garde-fou : une nuit isolée n'alerte pas).
    """
    cur.execute(
        """select detail->'scores_echecs'
             from pipeline_runs
            where job = 'nightly' and statut <> 'running'
            order by demarre_le desc limit %s""",
        (SCORES_ECHEC_NUITS,),
    )
    nights = [
        (r[0] if isinstance(r[0], dict) else (json.loads(r[0]) if r[0] else {}))
        for r in cur.fetchall()
    ]
    recurrents = recurrent_score_failures(nights)
    if recurrents:
        detail = ", ".join(f"{fd} ({c}/{len(nights)} nuits)" for fd, c in sorted(recurrents.items()))
        alerts.append(
            f"scores : rafraîchissement en échec RÉCURRENT — {detail}. Score perdu si le "
            f"match sort de la fenêtre /scores (3 j). Vérifie la clé de sport / les alias."
        )
    else:
        print("scores      OK — aucun échec récurrent de rafraîchissement des scores")


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
        _repli_promu_rate(cur, alerts)
        _scores_refresh_failures(cur, alerts)
        _orientation_flip(cur, alerts)
        _vision_incomplete_rate(cur, alerts)
        _vision_refus_rate(cur, alerts)
    # Contrôle de schéma en DERNIER, connexion isolée (moteur potentiellement absent).
    _schema_drift(alerts)
    return alerts


def main() -> None:
    print_banner("health")
    alerts = check()
    if alerts:
        print("\nALERTE — pipeline potentiellement mort :", file=sys.stderr)
        for a in alerts:
            print("  - " + a, file=sys.stderr)
        # Canal 2 : email avec le MOTIF en objet (best-effort, ne lève jamais). Le
        # code 1 ci-dessous déclenche de toute façon l'email GitHub (canal 1).
        from .alerts_email import envoyer_alerte
        envoyer_alerte(alerts)
        sys.exit(1)
    print("\nTous les jobs sont frais.")


if __name__ == "__main__":
    main()
