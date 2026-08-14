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

from ..constants import ODDS_MARKETS, REPLI_ALERT
from .compute import PredictionRow, league_predictions, league_predictions_cote_seule
from .db import connect
from .provider import NullProvider, get_provider
from .source_mode import next_mode

DEFAULT_DAYS = 7


def _repli_rates(repli: dict[str, dict[str, list[int]]]) -> list[dict]:
    """`fd -> marché -> [repli, base]` → liste triée {ligue, marché, repli, base, taux}.

    « base » = lignes qu'on a tenté de sourcer À LA COTE (odds + repli). Les
    bascules marge (model_marge_excessive) sont un choix, pas une panne : exclues.
    """
    out = []
    for fd, marches in repli.items():
        for mk, (rp, base) in marches.items():
            if base:
                out.append({"ligue": fd, "marche": mk, "repli": rp,
                            "base": base, "taux": round(rp / base, 3)})
    out.sort(key=lambda d: (d["taux"], d["base"]), reverse=True)
    return out


def _totals_book_report(fixtures: list[tuple[int, str]],
                        odds: dict[int, dict[str, float]],
                        books: dict[int, dict[str, str]]) -> dict[str, list[dict]]:
    """Quel book sert le plus/moins 2,5, et sa marge OU, PAR LIGUE.

    `fixtures` : liste (fixture_id, ligue). Renvoie ligue → liste triée
    {book, matchs, marge_pct}. C'est LA donnée qui dira, plus tard, si escalader
    vers `alternate_totals` (Pinnacle 2,5 garanti) vaut les crédits — sans elle,
    on ne pourra jamais trancher (voir README, écarts backtest/production).
    """
    acc: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for fid, lg in fixtures:
        o = odds.get(fid, {})
        if "OVER_2_5" not in o or "UNDER_2_5" not in o:
            continue
        bk = books.get(fid, {})
        book = bk.get("OVER_2_5") or bk.get("UNDER_2_5") or "?"
        marge = 1 / o["OVER_2_5"] + 1 / o["UNDER_2_5"] - 1
        acc[lg][book].append(marge)
    out: dict[str, list[dict]] = {}
    for lg, bks in acc.items():
        rows = [{"book": b, "matchs": len(ms), "marge_pct": round(100 * sum(ms) / len(ms), 2)}
                for b, ms in bks.items()]
        rows.sort(key=lambda d: d["matchs"], reverse=True)
        out[lg] = rows
    return out


def leagues_over_totals_margin(night: dict[str, list[dict]], seuil_pct: float) -> list[str]:
    """Ligues dont la marge OU-2,5 (pondérée par le nb de matchs) dépasse le seuil.

    Sert le critère d'escalade vers `alternate_totals` (voir README).
    """
    over: list[str] = []
    for lg, rows in (night or {}).items():
        tot = sum(r["matchs"] for r in rows)
        if not tot:
            continue
        pondere = sum(r["marge_pct"] * r["matchs"] for r in rows) / tot
        if pondere > seuil_pct:
            over.append(lg)
    return over


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


def _fetch_latest_odds(con, fixture_ids: list[int]) -> tuple[dict[int, dict[str, float]], dict[int, dict[str, str]]]:
    """Dernière cote par (match, marché) + le bookmaker qui l'a fournie, PAR MARCHÉ.

    Le book est retenu par (match, marché) : depuis le correctif totals, le 1X2 et
    le plus/moins 2,5 d'un même match peuvent venir de books différents.
    """
    if not fixture_ids:
        return {}, {}
    sql = """
        select distinct on (fixture_id, marche) fixture_id, marche, cote, bookmaker
          from odds_snapshots
         where fixture_id = any(%s)
         order by fixture_id, marche, releve_le desc
    """
    odds: dict[int, dict[str, float]] = defaultdict(dict)
    books: dict[int, dict[str, str]] = defaultdict(dict)
    with con.cursor() as cur:
        cur.execute(sql, (fixture_ids,))
        for fixture_id, marche, cote, bookmaker in cur.fetchall():
            fid = int(fixture_id)
            odds[fid][marche] = float(cote)
            if bookmaker:
                books[fid][marche] = bookmaker
    return dict(odds), dict(books)


def _fetch_regimes(con) -> dict[str, str]:
    """fd_code (= provider_ref des leagues) → régime ('modele' | 'cote_seule').

    En régime cote seule, le nocturne ne fait PAS tourner le modèle : il dé-vige la
    cote seule (et dérive la double chance). Aucun historique requis pour ces
    championnats — c'est justement pourquoi ils sont en cote seule."""
    with con.cursor() as cur:
        cur.execute("select fd_code, regime from league_catalog")
        return {fd: reg for fd, reg in cur.fetchall()}


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
            regimes = _fetch_regimes(con)

            ref_date = pd.Timestamp(jour)
            all_rows: list[PredictionRow] = []
            detail: dict = defaultdict(lambda: defaultdict(int))
            # Taux de repli par marché coté ET par ligue (métrique permanente) :
            #   fd -> marché -> [repli, base(odds+repli)].
            repli: dict = defaultdict(lambda: defaultdict(lambda: [0, 0]))
            for league_code, up in upcoming.groupby("league_code"):
                fd = str(league_code)
                if regimes.get(fd) == "cote_seule":
                    # Non backtesté : cote dé-vigée seule + double chance dérivée.
                    rows = league_predictions_cote_seule(up, fd, odds, books)
                else:
                    hist = history[history["league_code"] == league_code]
                    rows = league_predictions(hist, up, fd, ref_date, odds, books, margin_override=fd in model_leagues)
                for r in rows:
                    detail[fd][r.source] += 1
                    if r.marche in ODDS_MARKETS and r.source in ("odds", "repli"):
                        repli[fd][r.marche][1] += 1
                        if r.source == "repli":
                            repli[fd][r.marche][0] += 1
                all_rows.extend(rows)

            _write_predictions(con, all_rows, jour)
            fixtures_done = len({r.fixture_id for r in all_rows})
            statut = "success" if fixtures_done else "partial"
            journal: dict = dict(detail)
            repli_rates = _repli_rates(repli)
            if repli_rates:
                journal["repli_marches"] = repli_rates
            fixtures_lg = ([(int(f), str(l)) for f, l in
                            zip(upcoming["fixture_id"], upcoming["league_code"])]
                           if not upcoming.empty else [])
            totals_books = _totals_book_report(fixtures_lg, odds, books)
            if totals_books:
                journal["totals_2_5_books"] = totals_books
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
        print(f"  {lg:<5} cote {c['odds']:>3}  modèle {c['model']:>3}  repli {c['repli']:>3}  "
              f"cote_seule {c['cote_seule']:>3}  dérivée {c['cote_derivee']:>3}")
    hot = [d for d in repli_rates if d["taux"] >= REPLI_ALERT]
    if hot:
        print(f"  ⚠ repli élevé sur marché coté (≥ {REPLI_ALERT:.0%}) :")
        for d in hot:
            print(f"      {d['ligue']:<4} {d['marche']:<10} {d['taux']:>5.0%}  ({d['repli']}/{d['base']})")
    if totals_books:
        print("  book du plus/moins 2,5 par ligue (marge OU moyenne) :")
        for lg in sorted(totals_books):
            parts = ", ".join(f"{r['book']}×{r['matchs']} {r['marge_pct']:.1f}%" for r in totals_books[lg])
            print(f"      {lg:<4} {parts}")
    return {"jour": str(jour), "fixtures": fixtures_done, "lignes": len(all_rows),
            "detail": detail, "repli_marches": repli_rates, "totals_2_5_books": totals_books}


# Marchés représentatifs : un par famille de source pour montrer l'hybride.
#   WIN_HOME     → cote (ou model_marge_excessive si la ligue a basculé)
#   DC_HOME_DRAW → modèle
#   OVER_1_5     → modèle
#   OVER_2_5     → cote (ou repli si la cote totals manquait)
_SAMPLE_MARKETS = ("WIN_HOME", "DC_HOME_DRAW", "OVER_1_5", "OVER_2_5")


def sample_predictions(limit: int = 10) -> None:
    """Affiche un échantillon de predictions avec source + confiance (contrôle).

    Trois blocs :
      1. l'état de source par ligue (`league_source_state`) — preuve de la bascule
         marge ; c'est là que la Grèce apparaît en mode « model » même sans match
         à venir dans la fenêtre ;
      2. la répartition des predictions par source, tous jours confondus ;
      3. un échantillon ÉTALÉ sur les ligues (un match représentatif par ligue,
         quatre marchés-clés), pour voir l'hybride cote/modèle en un coup d'œil.
    """
    etat_sql = """
        select fd_code, mode, marge_7j, bascule_le
          from league_source_state
         order by (mode <> 'odds') desc, fd_code
    """
    # Un match par ligue (le premier du jour de calcul), sur les marchés-clés.
    sample_sql = """
        with dernier as (select max(jour_calcul) j from predictions),
             premier as (
               select f.league_id, min(p.fixture_id) as fid
                 from predictions p
                 join fixtures f on f.id = p.fixture_id
                where p.jour_calcul = (select j from dernier)
                group by f.league_id
             )
        select l.provider_ref, th.nom, ta.nom, p.marche, p.probabilite,
               p.source, p.confiance, coalesce(p.bookmaker, '—')
          from predictions p
          join premier  pr on pr.fid = p.fixture_id
          join fixtures f  on f.id = p.fixture_id
          join leagues  l  on l.id = f.league_id
          join teams th on th.id = f.team_home_id
          join teams ta on ta.id = f.team_away_id
         where p.jour_calcul = (select j from dernier)
           and p.marche = any(%s)
         order by l.provider_ref, p.fixture_id,
                  array_position(%s, p.marche)
         limit %s
    """
    markets = list(_SAMPLE_MARKETS)
    with connect() as con:
        with con.cursor() as cur:
            cur.execute(etat_sql)
            etat = cur.fetchall()
            cur.execute("select source, count(*) from predictions group by source order by source")
            par_source = cur.fetchall()
            cur.execute(sample_sql, (markets, markets, limit))
            rows = cur.fetchall()

    # « mode » ici = état de la BASCULE MARGE (source_mode), PAS le régime calibré.
    # mode 'model' → repli modèle POUR MARGE excessive → source model_marge_excessive,
    # confiance PLAFONNÉE (jamais « normale »). À ne pas confondre avec le régime
    # modèle d'un championnat backtesté.
    MODE_LABEL = {"model": "repli modèle (marge excessive)", "odds": "cote (marge normale)"}
    print("Bascule marge par ligue (league_source_state) — état de source_mode, PAS le régime :")
    print(f"  {'lig':<5}{'bascule marge':<32}{'marge 7j':>9}  dernière bascule")
    for fd, mode, marge, bascule in etat:
        mpct = f"{float(marge) * 100:.1f}%" if marge is not None else "—"
        when = bascule.strftime("%Y-%m-%d") if bascule else "—"
        print(f"  {fd:<5}{MODE_LABEL.get(mode, mode):<32}{mpct:>9}  {when}")

    print("\nRépartition des predictions par source :")
    for src, n in par_source:
        print(f"  {src:<24} {n}")

    print(f"\nÉchantillon ({len(rows)} lignes, un match par ligue) :")
    print(f"  {'lig':<4}{'match':<34}{'marché':<14}{'proba':>7}{'source':>24}{'conf':>6}  book")
    for fd, h, a, m, proba, source, conf, book in rows:
        match = f"{h[:15]}–{a[:15]}"
        print(f"  {fd:<4}{match:<34}{m:<14}{float(proba):>7.3f}{source:>24}{float(conf):>6.2f}  {book}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Pipeline nocturne — calcule et écrit predictions.")
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS, help="fenêtre de matchs à venir (jours)")
    ap.add_argument("--sample", type=int, metavar="N", help="n'affiche qu'un échantillon de N predictions")
    args = ap.parse_args()
    if args.sample:
        sample_predictions(args.sample)
    else:
        run_nightly(days=args.days)


if __name__ == "__main__":
    main()
