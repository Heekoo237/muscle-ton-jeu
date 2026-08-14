"""COLLECTEUR de cotes — job DISTINCT du pipeline nocturne, toutes les 6 h.

    MTJ_DATABASE_URL=… MTJ_PROVIDER=oddsapi MTJ_PROVIDER_KEY=… \
        python -m mtj_model.pipeline.collector

Pour CHAQUE championnat : relève les cotes courantes des matchs à venir, crée les
matchs et équipes manquants (rattachement), et historise les cotes dans
`odds_snapshots`. Chaque relève est un point de mouvement de cote.

Idempotence : une seule ligne par fenêtre de 6 h (fixture × marché × bookmaker) —
deux passages dans la même fenêtre mettent à jour la même ligne, sans doublon.

Ce job n'ajuste AUCUN modèle. Mais il écrit, dans la foulée, les prédictions
COTE SEULE — un simple dévigeage déterministe de la cote qu'il vient de relever,
via la MÊME fonction que le nocturne (`predictions_io.cote_seule_rows`), d'où une
valeur identique (invariant `test_two_writers.py`). Cela comble le trou où un
match coté restait « pas encore de données » jusqu'à la nuit. Le MODÈLE, lui,
reste au nocturne : il a besoin de l'ajustement Dixon-Coles, une fois par nuit.

On ne fusionne pas les deux jobs pour autant : les cotes bougent toute la journée
(collecte 6 h), l'ajustement du modèle se fige une fois par nuit.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone

from .db import connect, window_6h
from .predictions_io import cote_seule_rows, write_predictions
from .provider import NullProvider, get_provider
from .quota import assert_quota_ok, planned_monthly_credits
from .sync import league_worklist, resolve_fixture, slots_for


def _margins(odds) -> dict:
    """Marge du bookmaker par ligue : (Σ 1/cote) − 1 sur un groupe mutuel.

    Le dévigage a été calibré au backtest sur Pinnacle (~2,84 %). Sur les ligues
    où Pinnacle est absent, un autre book sert — sa marge est plus élevée. On la
    mesure pour la voir a posteriori (par ligue ET par bookmaker retenu).
    """
    by_fx: dict[str, dict[str, float]] = defaultdict(dict)
    books: dict[str, int] = defaultdict(int)
    for o in odds:
        by_fx[o.fixture_ref][o.marche] = o.cote
        books[o.bookmaker] += 1
    m1x2, mou = [], []
    for mk in by_fx.values():
        if all(k in mk for k in ("WIN_HOME", "DRAW", "WIN_AWAY")):
            m1x2.append(1 / mk["WIN_HOME"] + 1 / mk["DRAW"] + 1 / mk["WIN_AWAY"] - 1)
        if all(k in mk for k in ("OVER_2_5", "UNDER_2_5")):
            mou.append(1 / mk["OVER_2_5"] + 1 / mk["UNDER_2_5"] - 1)
    avg = lambda xs: round(100 * sum(xs) / len(xs), 2) if xs else None  # noqa: E731
    return {
        "book": max(books, key=books.get) if books else None,
        "marge_1x2_pct": avg(m1x2),
        "marge_ou_pct": avg(mou),
        "matchs": len(by_fx),
    }


def _open_run(con) -> int:
    with con.cursor() as cur:
        cur.execute("insert into pipeline_runs (job, statut) values ('collector', 'running') returning id")
        return cur.fetchone()[0]


def _close_run(con, run_id: int, statut: str, n: int, detail: dict, erreur: str | None = None) -> None:
    with con.cursor() as cur:
        cur.execute(
            """update pipeline_runs set statut=%s, fixtures_traites=%s, detail=%s, erreur=%s, termine_le=now()
                where id=%s""",
            (statut, n, json.dumps(detail), erreur, run_id),
        )


def _write_snapshot(con, fixture_id: int, marche: str, bookmaker: str, cote: float, fenetre) -> None:
    sql = """
        insert into odds_snapshots (fixture_id, marche, bookmaker, cote, fenetre_6h, releve_le)
        values (%s, %s, %s, %s, %s, now())
        on conflict (fixture_id, marche, bookmaker, fenetre_6h) do update set
            cote = excluded.cote, releve_le = now()
    """
    with con.cursor() as cur:
        cur.execute(sql, (fixture_id, marche, bookmaker, cote, fenetre))


def run_collector(days: int = 7, now: datetime | None = None, force_all: bool = False) -> dict:
    now = now or datetime.now(timezone.utc)
    fenetre = window_6h(now)
    provider = get_provider()
    if isinstance(provider, NullProvider):
        raise SystemExit(
            "Collecteur : fournisseur non branché. Renseigne MTJ_PROVIDER=oddsapi et "
            "MTJ_PROVIDER_KEY (clé The Odds API) avant de lancer."
        )

    detail: dict[str, int] = defaultdict(int)
    marges: dict[str, dict] = {}
    erreurs: dict[str, str] = {}
    # Prédictions COTE SEULE écrites dans la foulée (par ligue + total). On les
    # journalise TOUJOURS, même à zéro : un zéro un jour de collecte doit se voir.
    preds_par_ligue: dict[str, int] = {}
    preds_total = 0
    jour = now.date()
    total = 0
    with connect() as con:
        run_id = _open_run(con)
        full = league_worklist(con)
        # GARDE-FOU DE PALIER : on lit le palier RÉEL via un appel GRATUIT (/sports)
        # AVANT toute collecte payante, et on refuse de démarrer si le plan mensuel
        # dépasse le palier détecté. Un palier gratuit (500) ne doit jamais recevoir
        # un plan de 5 700 sans qu'on le voie s'arrêter net.
        provider.sports()
        assert_quota_ok(provider, full)
        # Fréquence graduée : ce tour ne relève QUE les compétitions dont la fenêtre
        # tombe maintenant (modèle 4/j → chaque fenêtre ; cote seule 1/j → une seule).
        # `force_all` court-circuite le gating : collecte de TOUTES les compétitions,
        # pour valider à la demande sans attendre la fenêtre de 6 h (≈ 45 × 2 crédits).
        if force_all:
            leagues = full
            print(f"Collecte FORCÉE (toutes compétitions, hors fréquence graduée) : {len(full)} compétitions.")
        else:
            leagues = [lg for lg in full if fenetre.hour in slots_for(lg["releves_par_jour"])]
        for lg in leagues:
            # Un championnat qui échoue (clé de sport erronée, 404, réseau) ne doit
            # PAS faire tomber les autres. Point de reprise (savepoint) par ligue :
            # ce qui échoue est annulé seul, le reste est conservé.
            try:
                with con.transaction():
                    odds = provider.odds(lg["odds_api_key"], days_ahead=days)
                    fixture_cache: dict[str, int] = {}
                    touched: set[int] = set()
                    for o in odds:
                        fid = fixture_cache.get(o.fixture_ref)
                        if fid is None:
                            fid = resolve_fixture(con, lg["league_id"], o)
                            fixture_cache[o.fixture_ref] = fid
                        _write_snapshot(con, fid, o.marche, o.bookmaker, o.cote, fenetre)
                        touched.add(fid)
                        detail[lg["fd_code"]] += 1
                        total += 1
                    if odds:
                        marges[lg["fd_code"]] = _margins(odds)
                    # COTE SEULE : on écrit la prédiction TOUT DE SUITE, sans attendre
                    # le nocturne. Dévigeage déterministe (aucun modèle, aucun
                    # historique), lu depuis les snapshots qu'on vient d'écrire, via la
                    # MÊME fonction que le nocturne (predictions_io.cote_seule_rows) →
                    # valeur identique, deux écrivains sans divergence. Le modèle, lui,
                    # reste au nocturne (il a besoin de l'ajustement Dixon-Coles).
                    if lg["regime"] == "cote_seule" and touched:
                        rows = cote_seule_rows(con, lg["fd_code"], touched)
                        write_predictions(con, rows, jour)
                        preds_par_ligue[lg["fd_code"]] = len(rows)
                        preds_total += len(rows)
            except Exception as exc:  # noqa: BLE001
                erreurs[lg["fd_code"]] = str(exc)[:300]

        statut = "success" if not erreurs else ("failed" if len(erreurs) == len(leagues) else "partial")
        credits = getattr(provider, "credits_used", None)
        restants = getattr(provider, "credits_remaining", None)
        palier = getattr(provider, "credits_quota", None)
        plan_mensuel = planned_monthly_credits(full)
        journal = dict(detail) | {
            "fenetre": fenetre.isoformat(), "credits": credits,
            "credits_restants": restants, "palier_detecte": palier,
            "plan_mensuel": plan_mensuel, "marges": marges,
            # Prédictions cote seule écrites en direct (par ligue + total). Toujours
            # présent, même à zéro — un zéro doit se voir dans le journal.
            "predictions_cote_seule": preds_total,
            "predictions_cote_seule_par_ligue": preds_par_ligue,
        }
        if erreurs:
            journal["erreurs"] = erreurs
        _close_run(con, run_id, statut, total, journal, erreur="; ".join(erreurs) or None)

    print(f"Collecteur {fenetre:%Y-%m-%d %H:%M UTC} : {total} cotes relevées ({statut}).")
    for lg, n in sorted(detail.items()):
        m = marges.get(lg, {})
        book = m.get("book", "—")
        mg = m.get("marge_1x2_pct")
        preds = preds_par_ligue.get(lg)
        pred_txt = f"  ·  {preds} prédictions cote seule" if preds is not None else ""
        print(f"  {lg:<5} {n:>4} cotes  ·  {book:<12} marge 1X2 {mg if mg is not None else '—'}%{pred_txt}")
    # Toujours affiché, même à zéro : c'est le signal que l'écriture en direct vit.
    print(f"Prédictions cote seule écrites en direct : {preds_total}")
    for lg, e in sorted(erreurs.items()):
        print(f"  {lg:<5} ÉCHEC : {e}")
    if credits is not None:
        # Plan mensuel = fréquence graduée réelle, pas une projection à plat.
        print(f"Crédits ce run : {credits}  ·  restants : {restants}  ·  "
              f"palier détecté : {palier if palier is not None else '?'}  ·  "
              f"plan mensuel (fréquence graduée) ≈ {plan_mensuel} / mois")
    return {"fenetre": fenetre.isoformat(), "snapshots": total, "statut": statut,
            "credits": credits, "palier_detecte": palier, "plan_mensuel": plan_mensuel,
            "predictions_cote_seule": preds_total, "erreurs": erreurs}


def main() -> None:
    ap = argparse.ArgumentParser(description="Collecteur de cotes (6 h) — historise les mouvements.")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--all", action="store_true",
                    help="forcer la collecte de TOUTES les compétitions (hors fréquence graduée)")
    args = ap.parse_args()
    run_collector(days=args.days, force_all=args.all)


if __name__ == "__main__":
    main()
