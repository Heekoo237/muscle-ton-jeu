"""Diagnostic COUVERTURE du marché plus/moins 2,5 (totals).

Motivation : dans l'échantillon nocturne, OVER_2_5 retombe en « repli » sur tous
les matchs, alors que le backtest a validé ce marché comme meilleur À LA COTE.
On veut savoir POURQUOI la cote totals manque, avec des chiffres, pas des suppositions.

Ce module interroge le fournisseur SANS le filtre de parsing (`point == 2.5`) et
mesure, par championnat :
  - matchs à venir cotés (au moins un book) ;
  - part ayant une ligne h2h chez le book RETENU (Pinnacle en priorité) ;
  - part ayant une ligne totals — n'importe quel point — chez le book retenu ;
  - part ayant une ligne totals AU POINT 2.5 exactement chez le book retenu ;
  - part ayant un totals 2.5 chez UN book EU quelconque (le repli inter-book) ;
  - distribution des points totals réellement postés (2.25 / 2.5 / 2.75 / 3.0…) ;
  - le tout ventilé par délai avant le coup d'envoi (< 2 j, 2–4 j, ≥ 4 j).

Deux hypothèses testées d'un coup :
  H1 — un seul book est lu par match : si Pinnacle poste h2h mais pas totals, on
       perd le totals alors qu'un autre book EU l'aurait ;
  H2 — la ligne principale n'est pas 2.5 : Pinnacle poste souvent 2.25 / 2.75,
       qu'on jette en exigeant `point == 2.5`.

Aucune écriture. Lecture fournisseur seule (~1 crédit par ligue).

    MTJ_PROVIDER=oddsapi MTJ_PROVIDER_KEY=… MTJ_DATABASE_URL=… \
        python -m mtj_model.pipeline.diag_totals
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

from .db import connect
from .provider import REGION, BOOKMAKER, _parse_dt, get_provider
from .sync import league_worklist


def _bucket(hours: float) -> str:
    if hours < 48:
        return "< 2 j"
    if hours < 96:
        return "2–4 j"
    return "≥ 4 j"


def _totals_points(bookmaker: dict) -> set[float]:
    """Points des lignes totals postées par CE book (ex. {2.25} ou {2.5, 3.0})."""
    pts: set[float] = set()
    for market in bookmaker.get("markets", []):
        if market.get("key") == "totals":
            for oc in market.get("outcomes", []):
                p = oc.get("point")
                if isinstance(p, (int, float)):
                    pts.add(float(p))
    return pts


def _has_h2h(bookmaker: dict) -> bool:
    return any(m.get("key") == "h2h" for m in bookmaker.get("markets", []))


def _ref_book(bookmakers: list[dict]) -> dict | None:
    for b in bookmakers:
        if b.get("key") == BOOKMAKER:
            return b
    return bookmakers[0] if bookmakers else None


def run(now: datetime | None = None) -> None:
    now = now or datetime.now(timezone.utc)
    provider = get_provider()
    with connect() as con:
        leagues = league_worklist(con)

    print(f"Diagnostic totals — {now:%Y-%m-%d %H:%M UTC}  (region={REGION}, book réf={BOOKMAKER})\n")
    header = (f"  {'lig':<5}{'matchs':>7}{'h2h réf':>8}{'tot réf':>8}"
              f"{'2.5 réf':>8}{'2.5 tout':>9}   points postés (book réf)")
    print(header)

    point_hist_global: Counter = Counter()
    bucket_stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # bucket -> [matchs, avec 2.5 réf]

    for lg in leagues:
        key, fd = lg["odds_api_key"], lg["fd_code"]
        try:
            events = provider._get(  # noqa: SLF001 — diagnostic, lecture directe
                f"sports/{key}/odds",
                {"regions": REGION, "markets": "h2h,totals", "oddsFormat": "decimal"},
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  {fd:<5} ÉCHEC : {str(exc)[:80]}")
            continue

        n = h2h_ref = tot_ref = p25_ref = p25_any = 0
        points: Counter = Counter()
        for ev in events:
            dt = _parse_dt(ev.get("commence_time"))
            books = ev.get("bookmakers", [])
            if not books or not dt:
                continue
            n += 1
            hours = (dt - now).total_seconds() / 3600.0
            b = _bucket(hours)
            bucket_stats[b][0] += 1

            ref = _ref_book(books)
            if ref and _has_h2h(ref):
                h2h_ref += 1
            ref_pts = _totals_points(ref) if ref else set()
            if ref_pts:
                tot_ref += 1
                points.update(ref_pts)
                point_hist_global.update(ref_pts)
            if 2.5 in ref_pts:
                p25_ref += 1
            # 2.5 chez N'IMPORTE quel book EU (test du repli inter-book) :
            if any(2.5 in _totals_points(bk) for bk in books):
                p25_any += 1
                bucket_stats[b][1] += 1

        pct = lambda x: f"{100 * x / n:.0f}%" if n else "—"  # noqa: E731
        pts_str = "  ".join(f"{p:g}×{c}" for p, c in sorted(points.items()))
        print(f"  {fd:<5}{n:>7}{pct(h2h_ref):>8}{pct(tot_ref):>8}"
              f"{pct(p25_ref):>8}{pct(p25_any):>9}   {pts_str or '—'}")

    print("\nDistribution GLOBALE des points totals postés (book réf, tous matchs) :")
    tot = sum(point_hist_global.values()) or 1
    for p, c in sorted(point_hist_global.items()):
        bar = "█" * round(40 * c / tot)
        print(f"  {p:>4g}  {c:>4}  {100 * c / tot:>4.0f}%  {bar}")

    print("\nCouverture 2.5 (tout book) par délai avant coup d'envoi :")
    for b in ("< 2 j", "2–4 j", "≥ 4 j"):
        m, ok = bucket_stats[b]
        print(f"  {b:<7} {ok:>4}/{m:<4} matchs  ({100 * ok / m:.0f}% couverts)" if m
              else f"  {b:<7} aucun match")


if __name__ == "__main__":
    run()
