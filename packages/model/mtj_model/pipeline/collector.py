"""COLLECTEUR de cotes — job DISTINCT du pipeline nocturne, toutes les 6 h.

    MTJ_DATABASE_URL=… MTJ_PROVIDER=oddsapi MTJ_PROVIDER_KEY=… \
        python -m mtj_model.pipeline.collector

Pour CHAQUE championnat : relève les cotes courantes des matchs à venir, crée les
matchs et équipes manquants (rattachement), et historise les cotes dans
`odds_snapshots`. Chaque relève est un point de mouvement de cote.

Idempotence : une seule ligne par fenêtre de 6 h (fixture × marché × bookmaker) —
deux passages dans la même fenêtre mettent à jour la même ligne, sans doublon.

Ce job ne calcule AUCUNE probabilité. Il relève et historise, rien d'autre.
On ne le fusionne jamais avec le nocturne : les cotes bougent toute la journée,
les probabilités se figent une fois par nuit.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone

from .db import connect, window_6h
from .provider import NullProvider, get_provider
from .sync import league_worklist, resolve_fixture


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


def run_collector(days: int = 7, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    fenetre = window_6h(now)
    provider = get_provider()
    if isinstance(provider, NullProvider):
        raise SystemExit(
            "Collecteur : fournisseur non branché. Renseigne MTJ_PROVIDER=oddsapi et "
            "MTJ_PROVIDER_KEY (clé The Odds API) avant de lancer."
        )

    detail: dict[str, int] = defaultdict(int)
    total = 0
    with connect() as con:
        run_id = _open_run(con)
        try:
            for lg in league_worklist(con):
                odds = provider.odds(lg["odds_api_key"], days_ahead=days)
                fixture_cache: dict[str, int] = {}
                for o in odds:
                    fid = fixture_cache.get(o.fixture_ref)
                    if fid is None:
                        fid = resolve_fixture(con, lg["league_id"], o)
                        fixture_cache[o.fixture_ref] = fid
                    _write_snapshot(con, fid, o.marche, o.bookmaker, o.cote, fenetre)
                    detail[lg["fd_code"]] += 1
                    total += 1
            _close_run(con, run_id, "success", total, dict(detail) | {"fenetre": fenetre.isoformat()})
        except Exception as exc:  # noqa: BLE001
            _close_run(con, run_id, "failed", total, dict(detail), erreur=str(exc)[:2000])
            raise

    print(f"Collecteur {fenetre:%Y-%m-%d %H:%M UTC} : {total} cotes relevées.")
    for lg, n in sorted(detail.items()):
        print(f"  {lg:<5} {n:>4} cotes")
    return {"fenetre": fenetre.isoformat(), "snapshots": total, "detail": dict(detail)}


def main() -> None:
    ap = argparse.ArgumentParser(description="Collecteur de cotes (6 h) — historise les mouvements.")
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()
    run_collector(days=args.days)


if __name__ == "__main__":
    main()
