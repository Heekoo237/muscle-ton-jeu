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
from .predictions_io import fetch_latest_odds, write_predictions
from .provider import NullProvider, get_provider
from .source_mode import next_mode
from .version import print_banner

# Fenêtre d'analyse (jours à venir). DOIT rester égale à ANALYSIS_WINDOW_DAYS côté
# app (apps/web/src/lib/server/domain/window.ts) : le nocturne calcule les probas
# pour cette fenêtre, l'app résout les tickets sur la MÊME. 7 j était trop court —
# un ticket se compose 1 à 3 semaines avant les matchs.
DEFAULT_DAYS = 21


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


def _sync_via_provider(con, days: int) -> tuple[int | None, dict[str, str]]:
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
        return None, {}
    from .sync import refresh_scores  # import tardif : la synchro réelle vit à part
    _, echecs = refresh_scores(con, provider, days_from=3)
    # Coût MESURÉ (en-têtes fournisseur), pas supposé : c'est le SEUL poste payant du
    # nocturne (le calcul, lui, ne lit que la base). De quoi chiffrer une planification.
    return getattr(provider, "credits_used", None), echecs


# Au-delà de ce taux de matchs sautés (toutes ligues EN FENÊTRE confondues), le run
# est signalé 'partial' : un statut vert ne doit jamais masquer une couverture trouée.
NIGHTLY_SKIP_ALERT = 0.15


def coverage_report(model_codes, groups) -> tuple[dict, bool, dict]:
    """Couverture par championnat + verdict de dégradation. Fonction PURE (testable
    sans base) : c'est ELLE qui décide si un run vert ment sur sa couverture.

    `groups` : itérable de dict {fd, regime, fenetre, traites, hist_thin}.
    `model_codes` : codes des championnats MODÈLE attendus (catalogue).

    Retour `(couverture, degrade, resume)` :
      - couverture[fd] = {regime, fenetre, traites, sautes, raison}. `raison` :
          None                    → rien sauté ;
          'aucun_match_fenetre'   → 0 match en fenêtre (pré-saison — BÉNIN) ;
          'historique_insuffisant'→ modèle, fit non ajustable (ligue abandonnée) ;
          'equipe_inconnue'       → modèle, équipe absente du fit (nom qui diverge) ;
          'cote_absente'          → cote seule sans groupe de cotes dévigeable.
      - degrade : True si une ligue MODÈLE a des matchs EN FENÊTRE mais 0 traité,
                  ou si le taux global de matchs sautés dépasse NIGHTLY_SKIP_ALERT.
      - resume : {fenetre, traites, sautes, taux_saut, abandons:[fd…]}.
    """
    couverture: dict = {}
    vus: set = set()
    tot_fen = tot_tr = tot_inv = tot_repli = 0
    abandons: list = []
    for g in groups:
        fd = g["fd"]
        vus.add(fd)
        fenetre, traites = g["fenetre"], g["traites"]
        invalides = g.get("cotes_invalides", 0)
        repli = g.get("repli_promu", 0)
        sautes = max(0, fenetre - traites)
        if sautes == 0:
            raison = None
        elif invalides and g["regime"] == "cote_seule":
            raison = "cote_invalide"  # rejetée en amont (marge négative, cote ≤ 1…)
        elif g["regime"] == "cote_seule":
            raison = "cote_absente"
        elif g.get("hist_thin"):
            raison = "historique_insuffisant"
        else:
            raison = "equipe_inconnue"
        couverture[fd] = {"regime": g["regime"], "fenetre": fenetre, "traites": traites,
                          "sautes": sautes, "cotes_invalides": invalides,
                          "repli_promu": repli, "raison": raison}
        tot_fen += fenetre
        tot_tr += traites
        tot_inv += invalides
        tot_repli += repli
        if g["regime"] == "modele" and fenetre > 0 and traites == 0:
            abandons.append(fd)
    # Ligues modèle attendues SANS aucun match en fenêtre : bénin (pré-saison), mais
    # tracé — pour que « pas de ligne » ne se confonde jamais avec « abandon ».
    for fd in sorted(set(model_codes) - vus):
        couverture[fd] = {"regime": "modele", "fenetre": 0, "traites": 0, "sautes": 0,
                          "cotes_invalides": 0, "repli_promu": 0, "raison": "aucun_match_fenetre"}
    tot_sautes = tot_fen - tot_tr
    taux = round(tot_sautes / tot_fen, 3) if tot_fen else 0.0
    degrade = bool(abandons) or taux > NIGHTLY_SKIP_ALERT
    resume = {"fenetre": tot_fen, "traites": tot_tr, "sautes": tot_sautes, "taux_saut": taux,
              "cotes_invalides": tot_inv, "repli_promu": tot_repli, "abandons": abandons}
    return couverture, degrade, resume


def run_nightly(days: int = DEFAULT_DAYS, jour: date | None = None) -> dict:
    jour = jour or datetime.now(timezone.utc).date()
    with connect() as con:
        run_id = _open_run(con, jour)
        try:
            credits_sync, scores_echecs = _sync_via_provider(con, days)
            upcoming = _fetch_upcoming(con, days)
            history = _fetch_history(con)
            fixture_ids = [int(x) for x in upcoming["fixture_id"].tolist()] if not upcoming.empty else []
            odds, books = fetch_latest_odds(con, fixture_ids)

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
            # Couverture par ligue : {fd, regime, fenetre, traites, hist_thin}. On la
            # mesure au fil du groupby pour qu'un statut vert ne masque jamais une
            # ligue trouée (le problème qui a duré invisible).
            groups: list[dict] = []
            invalides: list[dict] = []  # cotes rejetées (fixture, marché, valeurs) — rapport
            for league_code, up in upcoming.groupby("league_code"):
                fd = str(league_code)
                cote_seule = regimes.get(fd) == "cote_seule"
                hist_thin = False
                inv_ligue: list[dict] = []
                repli_ligue: list[int] = []  # promus repliés en cote seule (ligue modèle)
                try:
                    if cote_seule:
                        # Non backtesté : cote dé-vigée seule + double chance dérivée.
                        rows = league_predictions_cote_seule(up, fd, odds, books, invalides=inv_ligue)
                    else:
                        hist = history[history["league_code"] == league_code]
                        # Même garde que le fit (compute.league_predictions) : historique
                        # trop mince → aucune ligne pour TOUTE la ligue. On le NOMME.
                        hist_thin = hist.empty or hist["home"].nunique() < 4
                        rows = league_predictions(hist, up, fd, ref_date, odds, books,
                                                  margin_override=fd in model_leagues,
                                                  invalides=inv_ligue, repli_promu=repli_ligue)
                except Exception as exc:  # noqa: BLE001 — une ligue ne fait JAMAIS tomber le run
                    print(f"  ⚠ ligue {fd} IGNORÉE (erreur non rattrapée) : {type(exc).__name__}: {exc}")
                    rows = []
                invalides.extend(inv_ligue)
                for r in rows:
                    detail[fd][r.source] += 1
                    if r.marche in ODDS_MARKETS and r.source in ("odds", "repli"):
                        repli[fd][r.marche][1] += 1
                        if r.source == "repli":
                            repli[fd][r.marche][0] += 1
                all_rows.extend(rows)
                nb_repli = len(set(repli_ligue))
                if nb_repli:
                    # Un championnat modèle avec beaucoup de repli promu doit se voir.
                    print(f"  repli cote seule (promus) {fd} : {nb_repli} match(s) sur {len(up)}")
                groups.append({
                    "fd": fd, "regime": "cote_seule" if cote_seule else "modele",
                    "fenetre": int(len(up)), "traites": len({r.fixture_id for r in rows}),
                    "hist_thin": hist_thin,
                    # Matchs distincts dont AU MOINS un groupe de cotes a été rejeté.
                    "cotes_invalides": len({i["fixture_id"] for i in inv_ligue}),
                    "repli_promu": nb_repli,
                })

            write_predictions(con, all_rows, jour)
            fixtures_done = len({r.fixture_id for r in all_rows})
            model_codes = [fd for fd, reg in regimes.items() if reg == "modele"]
            couverture, degrade, resume_cv = coverage_report(model_codes, groups)
            # Un run qui abandonne une ligue EN FENÊTRE, ou saute trop de matchs, n'est
            # PAS 'success'. Le statut mesure enfin la couverture, pas juste « pas planté ».
            statut = "partial" if (degrade or not fixtures_done) else "success"
            journal: dict = dict(detail)
            journal["couverture"] = couverture
            journal["couverture_resume"] = resume_cv
            journal["credits_sync"] = credits_sync  # coût mesuré du run (traçable dans le temps)
            # Ligues dont le rafraîchissement des scores a échoué cette nuit (isolées, non
            # fatales). Persisté pour détecter une RÉCURRENCE (surveillance) : une ligue qui
            # échoue chaque nuit est un vrai problème (clé morte, alias en collision).
            if scores_echecs:
                journal["scores_echecs"] = scores_echecs
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

    print(f"Nocturne {jour} : {fixtures_done} matchs, {len(all_rows)} lignes predictions "
          f"({statut}).")
    # Couverture par ligue : matchs en fenêtre / traités / sautés + raison. C'est la
    # ligne qui manquait — « success » ne dira plus jamais rien tout seul.
    r = resume_cv
    print(f"  couverture : {r['traites']}/{r['fenetre']} matchs traités "
          f"(sautés {r['sautes']}, {r['taux_saut']:.0%}).")
    if credits_sync is not None:
        print(f"  crédits fournisseur ce run : {credits_sync} (rafraîchissement des "
              f"résultats — SEUL poste payant ; le calcul lit la base).")
    if r.get("cotes_invalides"):
        print(f"  ⚠ {r['cotes_invalides']} match(s) à cote INVALIDE rejetés "
              f"(détail « [cote invalide] » ci-dessus).")
    if r.get("repli_promu"):
        print(f"  {r['repli_promu']} match(s) en repli COTE SEULE (promus hors modèle) — "
              f"source cote_seule, confiance basse.")
    if r["abandons"]:
        print(f"  ⚠ LIGUES ABANDONNÉES (matchs en fenêtre, AUCUNE ligne) : {', '.join(r['abandons'])}")
    for fd in sorted(couverture):
        cv = couverture[fd]
        if cv["fenetre"] == 0 and cv["regime"] == "modele":
            continue  # pré-saison : bénin, on n'encombre pas la sortie
        raison = f"  ⚠ {cv['raison']}" if cv["raison"] else ""
        print(f"    {fd:<6} {cv['regime']:<10} {cv['traites']:>3}/{cv['fenetre']:>3}{raison}")
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
            "statut": statut, "detail": detail, "repli_marches": repli_rates,
            "totals_2_5_books": totals_books, "couverture_resume": resume_cv}


def sample_predictions(limit: int = 30) -> None:
    """Affiche un échantillon de predictions avec source + confiance (contrôle).

    Trois blocs :
      1. l'état de source par ligue (`league_source_state`) — preuve de la bascule
         marge ; c'est là que la Grèce apparaît en mode « model » même sans match
         à venir dans la fenêtre ;
      2. la répartition des predictions par source, tous jours confondus ;
      3. un échantillon ÉTALÉ sur les ligues (un match représentatif par ligue,
         quatre marchés-clés), pour voir l'hybride cote/modèle en un coup d'œil.
    """
    # Nom LISIBLE depuis league_catalog (« Ligue 2 - France »), pas le code technique.
    etat_sql = """
        select coalesce(c.nom, s.fd_code) as nom, s.mode, s.marge_7j, s.bascule_le
          from league_source_state s
          left join league_catalog c on c.fd_code = s.fd_code
         order by (s.mode <> 'odds') desc, s.fd_code
    """
    # UN match par RÉGIME (cote seule + modèle), tous ses marchés — pour voir les
    # deux régimes côte à côte : cote_seule/cote_derivee + confiance basse d'un côté,
    # sources modèle/cote calibrées de l'autre.
    sample_sql = """
        with dernier as (select max(jour_calcul) j from predictions),
             par_regime as (
               select distinct fixture_id, regime, nom from (
                 select p.fixture_id, c.regime, c.nom
                   from predictions p
                   join fixtures f on f.id = p.fixture_id
                   join leagues  l on l.id = f.league_id
                   join league_catalog c on c.fd_code = l.provider_ref
                  where p.jour_calcul = (select j from dernier)
               ) t
             ),
             pick as (
               select fixture_id, regime, nom,
                      row_number() over (partition by regime order by fixture_id) rn
                 from par_regime
             )
        select k.regime, k.nom, th.nom, ta.nom, p.marche, p.probabilite,
               p.source, p.confiance, coalesce(p.bookmaker, '—')
          from predictions p
          join pick k on k.fixture_id = p.fixture_id and k.rn = 1
          join fixtures f on f.id = p.fixture_id
          join teams th on th.id = f.team_home_id
          join teams ta on ta.id = f.team_away_id
         where p.jour_calcul = (select j from dernier)
         order by k.regime, p.fixture_id, p.marche
         limit %s
    """
    with connect() as con:
        with con.cursor() as cur:
            cur.execute(etat_sql)
            etat = cur.fetchall()
            cur.execute("select source, count(*) from predictions group by source order by source")
            par_source = cur.fetchall()
            cur.execute(sample_sql, (limit,))
            rows = cur.fetchall()

    # « mode » ici = état de la BASCULE MARGE (source_mode), PAS le régime calibré.
    # mode 'model' → repli modèle POUR MARGE excessive → source model_marge_excessive,
    # confiance PLAFONNÉE (jamais « normale »). À ne pas confondre avec le régime
    # modèle d'un championnat backtesté.
    MODE_LABEL = {"model": "repli modèle (marge excessive)", "odds": "cote (marge normale)"}
    print("Bascule marge par championnat (league_source_state) — état de source_mode, PAS le régime :")
    print(f"  {'championnat':<26}{'bascule marge':<32}{'marge 7j':>9}  dernière bascule")
    for nom, mode, marge, bascule in etat:
        mpct = f"{float(marge) * 100:.1f}%" if marge is not None else "—"
        when = bascule.strftime("%Y-%m-%d") if bascule else "—"
        print(f"  {str(nom)[:24]:<26}{MODE_LABEL.get(mode, mode):<32}{mpct:>9}  {when}")

    print("\nRépartition des predictions par source :")
    for src, n in par_source:
        print(f"  {src:<24} {n}")

    REGIME_LABEL = {"cote_seule": "cote seule", "modele": "modèle"}
    print(f"\nÉchantillon deux régimes ({len(rows)} lignes, un match par régime, tous marchés) :")
    print(f"  {'régime':<11}{'championnat':<22}{'match':<28}{'marché':<14}{'proba':>7}  {'source':<22}{'conf':>5}  book")
    for regime, nom, h, a, m, proba, source, conf, book in rows:
        match = f"{h[:12]}–{a[:12]}"
        print(f"  {REGIME_LABEL.get(regime, regime):<11}{str(nom)[:20]:<22}{match:<28}{m:<14}"
              f"{float(proba):>7.3f}  {source:<22}{float(conf):>5.2f}  {book}")


def main() -> None:
    print_banner("nightly")
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
