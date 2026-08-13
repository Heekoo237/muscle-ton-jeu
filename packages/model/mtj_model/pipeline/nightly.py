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


def _fetch_latest_odds(con, fixture_ids: list[int]) -> dict[int, dict[str, float]]:
    if not fixture_ids:
        return {}
    sql = """
        select distinct on (fixture_id, marche) fixture_id, marche, cote
          from odds_snapshots
         where fixture_id = any(%s)
         order by fixture_id, marche, releve_le desc
    """
    out: dict[int, dict[str, float]] = defaultdict(dict)
    with con.cursor() as cur:
        cur.execute(sql, (fixture_ids,))
        for fixture_id, marche, cote in cur.fetchall():
            out[int(fixture_id)][marche] = float(cote)
    return dict(out)


def _write_predictions(con, rows: list[PredictionRow], jour: date) -> None:
    sql = """
        insert into predictions
            (fixture_id, marche, jour_calcul, probabilite, confiance, source, seuil_fragile, calcule_le)
        values (%s, %s, %s, %s, %s, %s, %s, now())
        on conflict (fixture_id, marche, jour_calcul) do update set
            probabilite   = excluded.probabilite,
            confiance     = excluded.confiance,
            source        = excluded.source,
            seuil_fragile = excluded.seuil_fragile,
            calcule_le    = now()
    """
    with con.cursor() as cur:
        cur.executemany(sql, [
            (r.fixture_id, r.marche, jour, r.probabilite, r.confiance, r.source, r.seuil_fragile)
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
    """Étape 1-2 : caler calendrier + résultats via le fournisseur (règle n°4).
    Sans fournisseur branché, on saute — les fixtures sont supposées déjà en base."""
    provider = get_provider()
    if isinstance(provider, NullProvider):
        print("Fournisseur non branché : synchronisation ignorée (fixtures lues telles quelles).")
        return
    # Un fournisseur réel remplirait ici leagues/teams/fixtures (upsert par provider_ref).
    raise NotImplementedError("Branche l'upsert du fournisseur réel ici (provider.fixtures).")


def run_nightly(days: int = DEFAULT_DAYS, jour: date | None = None) -> dict:
    jour = jour or datetime.now(timezone.utc).date()
    with connect() as con:
        run_id = _open_run(con, jour)
        try:
            _sync_via_provider(con, days)
            upcoming = _fetch_upcoming(con, days)
            history = _fetch_history(con)
            odds = _fetch_latest_odds(con, [int(x) for x in upcoming["fixture_id"].tolist()]) if not upcoming.empty else {}

            ref_date = pd.Timestamp(jour)
            all_rows: list[PredictionRow] = []
            detail: dict[str, dict[str, int]] = defaultdict(lambda: {"odds": 0, "model": 0, "repli": 0})
            for league_code, up in upcoming.groupby("league_code"):
                hist = history[history["league_code"] == league_code]
                rows = league_predictions(hist, up, str(league_code), ref_date, odds)
                for r in rows:
                    detail[str(league_code)][r.source] += 1
                all_rows.extend(rows)

            _write_predictions(con, all_rows, jour)
            fixtures_done = len({r.fixture_id for r in all_rows})
            statut = "success" if fixtures_done else "partial"
            _close_run(con, run_id, statut, fixtures_done, detail)
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
