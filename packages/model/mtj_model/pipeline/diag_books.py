"""
diag_books.py — SONDE en lecture seule : quelle part de nos prédictions vient d'un
ÉCHANGE de paris (Betfair, Matchbook…) plutôt que d'un bookmaker classique ?

Un exchange cote sur un carnet d'ordres, pas avec une marge : un carnet mince donne
des « cotes » aberrantes (cf. README, EFL Cup à 290 %). Notre dévigage est calibré
sur des bookmakers classiques. Avant de décider de les exclure, on MESURE leur poids.

On regarde le dernier jour de calcul et on ventile les prédictions ISSUES D'UNE COTE
(source `odds` / `cote_seule` — celles qui portent un `bookmaker`) par book, puis on
isole les exchanges. Les sources `model` / `repli` / `cote_derivee` n'ont pas de
book (rien à exclure là). Aucune écriture.
"""
from __future__ import annotations

from collections import defaultdict

from .db import connect

# Clés d'exchange chez The Odds API. Détection par sous-chaîne (couvre _eu/_uk/_au).
EXCHANGE_MARKERS = ("betfair_ex", "matchbook", "smarkets", "betdaq")


def is_exchange(book: str | None) -> bool:
    b = (book or "").lower()
    return any(m in b for m in EXCHANGE_MARKERS)


_SQL_BY_BOOK = """
    with dernier as (select max(jour_calcul) j from predictions)
    select coalesce(bookmaker, '(sans book: modèle/dérivée)') as book, count(*)
      from predictions
     where jour_calcul = (select j from dernier)
     group by book
     order by count(*) desc
"""

# Prédictions issues d'une cote (donc avec book), par championnat, pour voir QUELLES
# ligues dépendent d'un exchange.
_SQL_BY_LEAGUE = """
    with dernier as (select max(jour_calcul) j from predictions)
    select l.provider_ref as fd, p.bookmaker, count(*)
      from predictions p
      join fixtures f on f.id = p.fixture_id
      join leagues  l on l.id = f.league_id
     where p.jour_calcul = (select j from dernier)
       and p.bookmaker is not null
     group by l.provider_ref, p.bookmaker
"""


def run() -> None:
    with connect() as con, con.cursor() as cur:
        cur.execute(_SQL_BY_BOOK)
        by_book = cur.fetchall()
        cur.execute(_SQL_BY_LEAGUE)
        by_league = cur.fetchall()

    print("Prédictions du dernier jour, par book :")
    total = 0
    total_cote = 0
    total_exchange = 0
    for book, n in by_book:
        total += n
        has_book = not book.startswith("(sans book")
        marque = ""
        if has_book:
            total_cote += n
            if is_exchange(book):
                total_exchange += n
                marque = "  ⚠ EXCHANGE"
        print(f"  {book:<32} {n:>5}{marque}")

    print(f"\nTotal prédictions : {total}")
    if total_cote:
        pct_all = 100 * total_exchange / total if total else 0
        pct_cote = 100 * total_exchange / total_cote
        print(f"Issues d'une cote (avec book) : {total_cote}")
        print(f"Issues d'un EXCHANGE : {total_exchange}  "
              f"({pct_cote:.1f}% des prédictions cotées · {pct_all:.1f}% du total)")

    # Ligues qui dépendent d'un exchange (au moins une prédiction cotée par exchange).
    ligues_exchange: dict[str, int] = defaultdict(int)
    ligues_total: dict[str, int] = defaultdict(int)
    for fd, book, n in by_league:
        ligues_total[fd] += n
        if is_exchange(book):
            ligues_exchange[fd] += n
    if ligues_exchange:
        print("\nChampionnats servis (au moins en partie) par un exchange :")
        for fd in sorted(ligues_exchange, key=lambda k: -ligues_exchange[k]):
            print(f"  {fd:<28} {ligues_exchange[fd]:>4} / {ligues_total[fd]:>4} cotées via exchange")
    else:
        print("\nAucun championnat ne dépend d'un exchange sur ce jour.")


def main() -> None:
    run()


if __name__ == "__main__":
    main()
