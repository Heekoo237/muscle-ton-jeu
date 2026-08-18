"""E/S des prédictions — partagé par le NOCTURNE et le COLLECTEUR.

Deux écrivains batch écrivent dans `predictions` :
  - le nocturne (modèle Dixon-Coles + cote seule), une fois par nuit ;
  - le collecteur (cote seule uniquement), dans la foulée de chaque collecte.

Ils passent par les MÊMES fonctions ici. Pour une même entrée (mêmes cotes en
base), ils produisent donc la MÊME valeur — c'est l'invariant qui rend deux
écrivains acceptables, sans risque de divergence (test `test_two_writers.py`).
Le chemin temps réel, lui, ne fait que LIRE cette table (règle d'archi n°1).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

import pandas as pd

from .compute import PredictionRow, league_predictions_cote_seule


def fetch_latest_odds(
    con, fixture_ids: list[int]
) -> tuple[dict[int, dict[str, float]], dict[int, dict[str, str]]]:
    """Dernière cote par (match, marché) + le bookmaker qui l'a fournie, PAR MARCHÉ.

    Le book est retenu par (match, marché) : le 1X2 et le plus/moins 2,5 d'un même
    match peuvent venir de books différents. « Dernière » = `releve_le` le plus
    récent — même lecture pour le nocturne et le collecteur, d'où la même entrée.
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


def write_predictions(con, rows: list[PredictionRow], jour: date) -> None:
    """UPSERT des prédictions, clé (fixture, marché, jour). Idempotent : rejouable
    sans doublon, et deux écrivains le même jour écrasent la même ligne avec la même
    valeur (invariant). Une écriture plus récente (cotes fraîches) prime."""
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


def upcoming_frame(fixture_ids) -> pd.DataFrame:
    """Frame minimal (colonne `fixture_id` seule). `league_predictions_cote_seule`
    ne lit RIEN d'autre du frame ; le collecteur n'a donc pas besoin de reconstruire
    home/away/date pour produire exactement les mêmes lignes que le nocturne."""
    return pd.DataFrame({"fixture_id": list(fixture_ids)})


def fixtures_deja_modelisees(con, fixture_ids) -> set[int]:
    """Sous-ensemble de `fixture_ids` ayant DÉJÀ une prédiction de source MODÈLE
    (odds/model/repli/…), toutes dates confondues — c.-à-d. autre que cote_seule /
    cote_derivee.

    Sert à l'INTÉRIM cote seule du collecteur en régime modèle : on n'écrit (ou ne
    rafraîchit) l'intérim QUE pour les matchs sans proba modèle, pour ne JAMAIS
    écraser ni rétrograder une probabilité calibrée posée par le nocturne. Le
    nocturne, lui, écrase l'intérim ensuite (upsert par (match, marché, jour)).
    """
    fids = [int(f) for f in fixture_ids]
    if not fids:
        return set()
    with con.cursor() as cur:
        cur.execute(
            "select distinct fixture_id from predictions "
            "where fixture_id = any(%s) and source not in ('cote_seule', 'cote_derivee')",
            (fids,),
        )
        return {int(r[0]) for r in cur.fetchall()}


def cote_seule_rows(con, fd_code: str, fixture_ids) -> list[PredictionRow]:
    """Prédictions COTE SEULE d'un ensemble de fixtures, lues depuis `odds_snapshots`.

    UNE seule définition, appelée par le collecteur (et disponible au nocturne) : le
    dévigeage déterministe de `league_predictions_cote_seule`, alimenté par la même
    lecture de cotes. Aucun modèle, aucun historique — d'où l'écriture « dans la
    foulée » possible côté collecteur.
    """
    fids = list(fixture_ids)
    if not fids:
        return []
    odds, books = fetch_latest_odds(con, fids)
    return league_predictions_cote_seule(upcoming_frame(fids), fd_code, odds, books)
