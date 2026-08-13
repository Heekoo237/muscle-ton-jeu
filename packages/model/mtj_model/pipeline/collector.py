"""COLLECTEUR de cotes — job DISTINCT du pipeline nocturne, toutes les 6 h.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.collector [--days 7]

Relève les cotes courantes des matchs à venir et les historise dans
`odds_snapshots`. Chaque relève est un point de mouvement de cote. Idempotence :
une seule ligne par fenêtre de 6 h (fixture × marché × bookmaker) — deux passages
dans la même fenêtre mettent à jour la même ligne, sans doublon.

Ce job ne calcule AUCUNE probabilité. Il ne fait que relever et historiser. Le
pipeline nocturne, lui, lira la dernière cote connue. On ne les fusionne jamais :
les cotes bougent toute la journée, les probabilités se figent une fois par nuit.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

from .db import connect, window_6h
from .nightly import _fetch_upcoming  # réutilise la lecture des matchs à venir
from .provider import NullProvider, get_provider


def _open_collector_run(con) -> int:
    with con.cursor() as cur:
        cur.execute("insert into pipeline_runs (job, statut) values ('collector', 'running') returning id")
        return cur.fetchone()[0]


def _write_snapshots(con, snapshots, fenetre) -> int:
    """UPSERT idempotent par fenêtre de 6 h. Renvoie le nombre de relèves."""
    sql = """
        insert into odds_snapshots (fixture_id, marche, bookmaker, cote, fenetre_6h, releve_le)
        values (%s, %s, %s, %s, %s, now())
        on conflict (fixture_id, marche, bookmaker, fenetre_6h) do update set
            cote = excluded.cote, releve_le = now()
    """
    with con.cursor() as cur:
        cur.executemany(sql, [
            (s["fixture_id"], s["marche"], s["bookmaker"], s["cote"], fenetre)
            for s in snapshots
        ])
    return len(snapshots)


def _close_run(con, run_id: int, statut: str, n: int, detail: dict, erreur: str | None = None) -> None:
    with con.cursor() as cur:
        cur.execute(
            """update pipeline_runs set statut=%s, fixtures_traites=%s, detail=%s, erreur=%s, termine_le=now()
                where id=%s""",
            (statut, n, json.dumps(detail), erreur, run_id),
        )


def run_collector(days: int = 7, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    fenetre = window_6h(now)
    provider = get_provider()
    with connect() as con:
        run_id = _open_collector_run(con)
        try:
            upcoming = _fetch_upcoming(con, days)
            if isinstance(provider, NullProvider):
                # Sans fournisseur branché : rien à relever, mais le job réussit
                # (il n'a rien à faire), pour ne pas déclencher de fausse alerte.
                _close_run(con, run_id, "success", 0, {"note": "fournisseur non branché"})
                print("Fournisseur non branché : aucune cote relevée.")
                return {"snapshots": 0}

            # fixtures → ProviderFixture attendus par provider.odds (mapping réel à brancher)
            odds = provider.odds(upcoming.to_dict("records"))  # type: ignore[arg-type]
            snaps = [
                {"fixture_id": o.fixture_ref, "marche": o.marche, "bookmaker": o.bookmaker, "cote": o.cote}
                for o in odds
            ]
            n = _write_snapshots(con, snaps, fenetre)
            _close_run(con, run_id, "success", n, {"fenetre": fenetre.isoformat()})
        except Exception as exc:  # noqa: BLE001
            _close_run(con, run_id, "failed", 0, {}, erreur=str(exc)[:2000])
            raise
    print(f"Collecteur {fenetre:%Y-%m-%d %H:%M UTC} : {n} relèves.")
    return {"fenetre": fenetre.isoformat(), "snapshots": n}


def main() -> None:
    ap = argparse.ArgumentParser(description="Collecteur de cotes (6 h) — historise les mouvements.")
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()
    run_collector(days=args.days)


if __name__ == "__main__":
    main()
