"""Pipeline NOCTURNE (une fois par jour). Calcule les probabilités des matchs à
venir et les écrit dans `predictions`, historisées par jour de calcul.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.nightly [--days 7]

Séquence :
  1. ouvrir une ligne `pipeline_runs` (statut 'running')
  2. lire les matchs à venir + l'historique joué + les dernières cotes (Postgres)
  3. par championnat : ajuster Dixon-Coles, calculer les marchés couverts
  4. écrire `predictions` en UPSERT (idempotent : rejouable sans doublon)
  5. clôturer la ligne `pipeline_runs` avec le détail par ligue et par source

Idempotence : la clé (fixture, marché, jour) fait qu'une seconde exécution la
même nuit met à jour les mêmes lignes. Aucun doublon si une nuit échoue puis
reprend. Rien de calculé pour un marché non couvert (INCONNU, jamais « probable »).
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import date, datetime, timezone

import pandas as pd

from .compute import PredictionRow, league_predictions
from .db import connect
from .provider import NullProvider, get_provider
from .source_mode import next_mode

DEFAULT_DAYS = 7


def _fetch_upcoming(con, days: int) -> pd.DataFrame:
    sql = """
        select f.id as fixture_id, l.provider_ref as league_code,
               th.nom as home, ta.nom as away, f.date_utc
          from fixtures f
          join leagues l  on l.id = f.league_id
          join teams   th on th.id = f.team_home_id
          join teams   ta on ta.id = f.team_away_id
         where f.statut = 'scheduled'
           and f.date_utc >= now()
           and f.date_utc <  now() + (%s * interval '1 day')
    """
    with con.cursor() as cur:
        cur.execute(sql, (days,))
        cols = [c.name for c in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)


def _fetch_history(con) -> pd.DataFrame:
    sql = """
        select l.provider_ref as league_code, th.nom as home, ta.nom as away,
               f.score_home as fthg, f.score_away as ftag, f.date_utc as date
          from fixtures f
          join leagues l  on l.id = f.league_id
          join teams   th on th.id = f.team_home_id
          join teams   ta on ta.id = f.team_away_id
         where f.statut = 'finished'
           and f.score_home is not null and f.score_away is not null
    """
    with con.cursor() as cur:
        cur.execute(sql)
        cols = [c.name for c in cur.description]
        df = pd.DataFrame(cur.fetchall(), columns=cols)
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
    return df


def _fetch_latest_odds(con, fixture_ids: list[int]) -> tuple[dict[int, dict[str, float]], dict[int, str]]:
    """Dernière cote par (match, marché) + le bookmaker qui l'a fournie."""
    if not fixture_ids:
        return {}, {}
    sql = """
        select distinct on (fixture_id, marche) fixture_id, marche, cote, bookmaker
          from odds_snapshots
         where fixture_id = any(%s)
         order by fixture_id, marche, releve_le desc
    """
    odds: dict[int, dict[str, float]] = defaultdict(dict)
    books: dict[int, str] = {}
    with con.cursor() as cur:
        cur.execute(sql, (fixture_ids,))
        for fixture_id, marche, cote, bookmaker in cur.fetchall():
            fid = int(fixture_id)
            odds[fid][marche] = float(cote)
            if bookmaker:
                books[fid] = bookmaker  # un seul book par match (choisi à la collecte)
    return dict(odds), books


def _margins_7d(con) -> dict[str, float]:
    """Marge 1X2 moyenne sur 7 j par ligue (fraction), depuis les runs collecteur."""
    acc: dict[str, list[float]] = defaultdict(list)
    with con.cursor() as cur:
        cur.execute(
            """select detail->'marges' from pipeline_runs
                where job='collector' and demarre_le > now() - interval '7 days'
                  and detail ? 'marges'"""
        )
        for (marges,) in cur.fetchall():
            for fd, m in (marges or {}).items():
                v = m.get("marge_1x2_pct")
                if v is not None:
                    acc[fd].append(float(v) / 100.0)  # % → fraction
    return {fd: sum(xs) / len(xs) for fd, xs in acc.items() if xs}


def _apply_source_modes(con, marges_7d: dict[str, float]) -> tuple[set[str], list[dict]]:
    """Applique l'hystérésis, persiste l'état, renvoie (ligues en mode modèle, bascules)."""
    with con.cursor() as cur:
        cur.execute("select fd_code, mode from league_source_state")
        current = {fd: mode for fd, mode in cur.fetchall()}

        model_leagues: set[str] = set()
        switches: list[dict] = []
        for fd, marge in marges_7d.items():
            decision = next_mode(current.get(fd), marge)
            if decision.mode == "model":
                model_leagues.add(fd)
            if decision.changed:
                switches.append({"ligue": fd, "vers": decision.mode, "raison": decision.reason})
            cur.execute(
                """insert into league_source_state (fd_code, mode, marge_7j, bascule_le, maj_le)
                     values (%s, %s, %s, case when %s then now() else null end, now())
                   on conflict (fd_code) do update set
                     mode = excluded.mode,
                     marge_7j = excluded.marge_7j,
                     bascule_le = case when %s then now() else league_source_state.bascule_le end,
                     maj_le = now()""",
                (fd, decision.mode, round(marge, 4), decision.changed, decision.changed),
            )
    return model_leagues, switches


def _write_predictions(con, rows: list[PredictionRow], jour: date) -> None:
    sql = """
        insert into predictions
            (fixture_id, marche, jour_calcul, probabilite, confiance, source, seuil_fragile, bookmaker, calcule_le)
        values (%s, %s, %s, %s, %s, %s, %s, %s, now())
        on conflict (fixture_id, marche, jour_calcul) do update set
            probabilite   = excluded.probabilite,
            confiance     = excluded.confiance,
            source        = excluded.source,
            seuil_fragile = excluded.seuil_fragile,
            bookmaker     = excluded.bookmaker,
            calcule_le    = now()
    """
    with con.cursor() as cur:
        cur.executemany(sql, [
            (r.fixture_id, r.marche, jour, r.probabilite, r.confiance, r.source, r.seuil_fragile, r.bookmaker)
            for r in rows
        ])


def _open_run(con, jour: date) -> int:
    with con.cursor() as cur:
        cur.execute(
            "insert into pipeline_runs (job, jour_calcul, statut) values ('nightly', %s, 'running') returning id",
            (jour,),
        )
        return cur.fetchone()[0]


def _close_run(con, run_id: int, statut: str, fixtures: int, detail: dict, erreur: str | None = None) -> None:
    with con.cursor() as cur:
        cur.execute(
            """update pipeline_runs
                  set statut = %s, fixtures_traites = %s, detail = %s, erreur = %s, termine_le = now()
                where id = %s""",
            (statut, fixtures, json.dumps(detail), erreur, run_id),
        )


def _sync_via_provider(con, days: int) -> None:
    """Étape 1-2 : rafraîchir les RÉSULTATS récents via le fournisseur (règle n°4),
    pour que les forces d'équipes soient à jour. Le calendrier et les cotes sont
    déjà amenés par le collecteur. Sans fournisseur branché, on saute — les
    fixtures et résultats sont supposés déjà en base (ex. amorçage football-data).

    NB : le nocturne complet (backfill résultats) peut attendre ; l'urgence est le
    collecteur. Ici on ne bloque jamais le calcul si la synchro n'est pas branchée.
    """
    provider = get_provider()
    if isinstance(provider, NullProvider):
        print("Fournisseur non branché : synchro des résultats ignorée (base lue telle quelle).")
        return
    from .sync import refresh_scores  # import tardif : la synchro réelle vit à part
    refresh_scores(con, provider, days_from=3)


def run_nightly(days: int = DEFAULT_DAYS, jour: date | None = None) -> dict:
    jour = jour or datetime.now(timezone.utc).date()
    with connect() as con:
        run_id = _open_run(con, jour)
        try:
            _sync_via_provider(con, days)
            upcoming = _fetch_upcoming(con, days)
            history = _fetch_history(con)
            fixture_ids = [int(x) for x in upcoming["fixture_id"].tolist()] if not upcoming.empty else []
            odds, books = _fetch_latest_odds(con, fixture_ids)

            # Bascule cote ↔ modèle sur marge excessive (hystérésis 10 %/8 %).
            marges_7d = _margins_7d(con)
            model_leagues, switches = _apply_source_modes(con, marges_7d)

            ref_date = pd.Timestamp(jour)
            all_rows: list[PredictionRow] = []
            detail: dict = defaultdict(lambda: {"odds": 0, "model": 0, "repli": 0, "model_marge_excessive": 0})
            for league_code, up in upcoming.groupby("league_code"):
                fd = str(league_code)
                hist = history[history["league_code"] == league_code]
                rows = league_predictions(hist, up, fd, ref_date, odds, books, margin_override=fd in model_leagues)
                for r in rows:
                    detail[fd][r.source] += 1
                all_rows.extend(rows)

            _write_predictions(con, all_rows, jour)
            fixtures_done = len({r.fixture_id for r in all_rows})
            statut = "success" if fixtures_done else "partial"
            journal: dict = dict(detail)
            if switches:
                journal["bascules"] = switches
            _close_run(con, run_id, statut, fixtures_done, journal)
            for sw in switches:
                print(f"  BASCULE {sw['ligue']} → {sw['vers']} ({sw['raison']})")
        except Exception as exc:  # noqa: BLE001 — on journalise puis on relève
            _close_run(con, run_id, "failed", 0, {}, erreur=str(exc)[:2000])
            raise

    print(f"Nocturne {jour} : {fixtures_done} matchs, {len(all_rows)} lignes predictions.")
    for lg, c in sorted(detail.items()):
        print(f"  {lg:<5} cote {c['odds']:>3}  modèle {c['model']:>3}  repli {c['repli']:>3}")
    return {"jour": str(jour), "fixtures": fixtures_done, "lignes": len(all_rows), "detail": detail}


def main() -> None:
    ap = argparse.ArgumentParser(description="Pipeline nocturne — calcule et écrit predictions.")
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS, help="fenêtre de matchs à venir (jours)")
    args = ap.parse_args()
    run_nightly(days=args.days)


if __name__ == "__main__":
    main()
