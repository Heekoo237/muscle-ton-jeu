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
    marges: dict[str, dict] = {}
    erreurs: dict[str, str] = {}
    total = 0
    with connect() as con:
        run_id = _open_run(con)
        leagues = league_worklist(con)
        for lg in leagues:
            # Un championnat qui échoue (clé de sport erronée, 404, réseau) ne doit
            # PAS faire tomber les autres. Point de reprise (savepoint) par ligue :
            # ce qui échoue est annulé seul, le reste est conservé.
            try:
                with con.transaction():
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
                    if odds:
                        marges[lg["fd_code"]] = _margins(odds)
            except Exception as exc:  # noqa: BLE001
                erreurs[lg["fd_code"]] = str(exc)[:300]

        statut = "success" if not erreurs else ("failed" if len(erreurs) == len(leagues) else "partial")
        credits = getattr(provider, "credits_used", None)
        restants = getattr(provider, "credits_remaining", None)
        journal = dict(detail) | {
            "fenetre": fenetre.isoformat(), "credits": credits,
            "credits_restants": restants, "marges": marges,
        }
        if erreurs:
            journal["erreurs"] = erreurs
        _close_run(con, run_id, statut, total, journal, erreur="; ".join(erreurs) or None)

    print(f"Collecteur {fenetre:%Y-%m-%d %H:%M UTC} : {total} cotes relevées ({statut}).")
    for lg, n in sorted(detail.items()):
        m = marges.get(lg, {})
        book = m.get("book", "—")
        mg = m.get("marge_1x2_pct")
        print(f"  {lg:<5} {n:>4} cotes  ·  {book:<12} marge 1X2 {mg if mg is not None else '—'}%")
    for lg, e in sorted(erreurs.items()):
        print(f"  {lg:<5} ÉCHEC : {e}")
    if credits is not None:
        # Projection mensuelle : 4 relevés/jour × 30 jours.
        print(f"Crédits consommés ce run : {credits}  ·  restants : {restants}  "
              f"·  projection ≈ {credits * 4 * 30} / mois")
    return {"fenetre": fenetre.isoformat(), "snapshots": total, "statut": statut,
            "credits": credits, "erreurs": erreurs}


def main() -> None:
    ap = argparse.ArgumentParser(description="Collecteur de cotes (6 h) — historise les mouvements.")
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()
    run_collector(days=args.days)


if __name__ == "__main__":
    main()
