"""Backfill de l'historique football-data (3 saisons) dans Supabase.

POURQUOI (structurel, pas qualité) : toute la calibration — ECE par championnat,
seuils de fragilité par marché, paliers de confiance A/B/C — a été mesurée sur CET
historique. Le modèle de production DOIT s'ajuster dessus, sinon la confiance
affichée ne correspond plus à ce qu'on montre. Sur les marchés sans cote (double
chance, plus 1,5/3,5) le modèle est de plus la SEULE source.

    MTJ_DATABASE_URL=… MTJ_DATA_SOURCE=footballdata \
        python -m mtj_model.pipeline.backfill

Officiel football-data.co.uk prioritaire, miroir GitHub en repli (par fichier).
Idempotent : matchs par référence stable, équipes dédupliquées par clé normalisée.
"""
from __future__ import annotations

import argparse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ..constants import XI_PER_DAY
from ..data.load import _read_csv
from ..data.sources import SEASONS, csv_urls
from ..strength import fit_league
from .db import connect
from .sync import league_worklist, normalize_team_name, upsert_team

PKG_ROOT = Path(__file__).resolve().parents[2]
RAW = PKG_ROOT / "data" / "raw"


def _download(div: str, code: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    dest = RAW / f"bf_{div}_{code}.csv"
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    last: Exception | None = None
    for url in csv_urls(div, code):  # officiel puis miroir
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mtj-backfill/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
                data = r.read()
            if data:
                dest.write_bytes(data)
                return dest
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(f"{div} {code} injoignable (officiel + miroir) : {last}")


def _matches(div: str, code: str) -> pd.DataFrame:
    df = _read_csv(_download(div, code))
    if not {"Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"}.issubset(df.columns):
        return pd.DataFrame(columns=["date", "home", "away", "fthg", "ftag"])
    out = pd.DataFrame({
        "date": pd.to_datetime(df["Date"], dayfirst=True, errors="coerce"),
        "home": df["HomeTeam"].astype("string").str.strip(),
        "away": df["AwayTeam"].astype("string").str.strip(),
        "fthg": pd.to_numeric(df["FTHG"], errors="coerce"),
        "ftag": pd.to_numeric(df["FTAG"], errors="coerce"),
    })
    return out.dropna(subset=["date", "home", "away", "fthg", "ftag"])


def _odds_team_keys(con) -> dict[int, set[str]]:
    """Clés normalisées des équipes DÉJÀ en base (issues du fournisseur de cotes),
    par championnat — pour mesurer la réconciliation avant tout ajout football-data."""
    snap: dict[int, set[str]] = {}
    with con.cursor() as cur:
        cur.execute("select league_id, nom, aliases from teams")
        for league_id, nom, aliases in cur.fetchall():
            keys = {normalize_team_name(a) for a in [nom, *(aliases or [])]}
            snap.setdefault(int(league_id), set()).update(keys)
    return snap


def _batch_fixtures(con, rows: list[tuple]) -> None:
    sql = """
        insert into fixtures
            (provider_ref, date_utc, team_home_id, team_away_id, league_id, statut, score_home, score_away)
        values (%s, %s, %s, %s, %s, 'finished', %s, %s)
        on conflict (provider_ref) do update set
            statut = 'finished', score_home = excluded.score_home,
            score_away = excluded.score_away, date_utc = excluded.date_utc
    """
    with con.cursor() as cur:
        cur.executemany(sql, rows)


def backfill() -> dict:
    rapport: dict[str, dict] = {}
    frames: dict[str, pd.DataFrame] = {}
    with connect() as con:
        worklist = league_worklist(con)
        odds_keys = _odds_team_keys(con)

        for lg in worklist:
            fd, league_id = lg["fd_code"], lg["league_id"]
            parts = [_matches(fd, code) for code in SEASONS]
            df = pd.concat([p for p in parts if not p.empty], ignore_index=True) if any(not p.empty for p in parts) else pd.DataFrame()
            if df.empty:
                rapport[fd] = {"matchs": 0, "equipes": 0, "non_reconciliees": []}
                continue
            frames[fd] = df

            # Équipes : cache par clé normalisée (une seule requête d'upsert / équipe).
            team_cache: dict[str, int] = {}
            non_reconciliees: list[str] = []
            snap = odds_keys.get(league_id, set())
            for nom in pd.unique(pd.concat([df["home"], df["away"]]).astype(str)):
                key = normalize_team_name(nom)
                if key not in team_cache:
                    team_cache[key] = upsert_team(con, league_id, nom)
                    # Non réconciliée = aucune équipe « cote » ne partage sa clé.
                    if key not in snap:
                        non_reconciliees.append(nom)

            # Matchs terminés, par lots (idempotent sur la référence stable).
            rows = []
            for m in df.itertuples(index=False):
                kh, ka = normalize_team_name(m.home), normalize_team_name(m.away)
                ref = f"fd:{fd}:{m.date:%Y%m%d}:{kh}:{ka}"
                dt = datetime(m.date.year, m.date.month, m.date.day, 15, 0, tzinfo=timezone.utc)
                rows.append((ref, dt, team_cache[kh], team_cache[ka], league_id, int(m.fthg), int(m.ftag)))
            _batch_fixtures(con, rows)
            rapport[fd] = {
                "matchs": len(rows), "equipes": len(team_cache),
                "non_reconciliees": sorted(non_reconciliees),
            }

    _print_report(rapport, frames)
    return rapport


def _print_report(rapport: dict, frames: dict[str, pd.DataFrame]) -> None:
    print("\n" + "=" * 64)
    print("Backfill football-data — matchs chargés et réconciliation")
    print("=" * 64)
    print(f"  {'ligue':<6}{'matchs':>8}{'équipes':>9}{'non réconc.':>13}")
    total = 0
    for fd, r in sorted(rapport.items()):
        total += r["matchs"]
        print(f"  {fd:<6}{r['matchs']:>8}{r['equipes']:>9}{len(r['non_reconciliees']):>13}")
    print(f"  {'TOTAL':<6}{total:>8}")

    print("\nÉquipes NON réconciliées avec le fournisseur de cotes (clé normalisée) :")
    print("  (soit la normalisation a échoué, soit l'équipe n'est pas encore")
    print("   apparue dans un match à venir coté — début de saison.)")
    any_unrec = False
    for fd, r in sorted(rapport.items()):
        if r["non_reconciliees"]:
            any_unrec = True
            print(f"  {fd} ({len(r['non_reconciliees'])}) : " + ", ".join(r["non_reconciliees"]))
    if not any_unrec:
        print("  (aucune)")

    # Contrôle « à quoi ça ressemble » : forces d'équipe d'un échantillon de ligues.
    print("\n" + "=" * 64)
    print("Échantillon de forces d'équipe (contrôle : gros clubs en haut)")
    print("=" * 64)
    for fd in ("E0", "SP1", "F1"):
        df = frames.get(fd)
        if df is None or df.empty:
            continue
        fit = fit_league(df, df["date"].max(), XI_PER_DAY)
        # Force nette = attaque + défense : dans le modèle, une défense ÉLEVÉE est
        # une BONNE défense (elle réduit le λ adverse). Les deux se somment.
        order = sorted(fit.teams, key=lambda t: fit.attack[fit.index[t]] + fit.defense[fit.index[t]], reverse=True)
        print(f"\n  {fd} — attaque + défense (haut = fort) :")
        for t in order[:3]:
            i = fit.index[t]
            print(f"    +  {t:<24} att {fit.attack[i]:+.2f}  déf {fit.defense[i]:+.2f}")
        for t in order[-2:]:
            i = fit.index[t]
            print(f"    –  {t:<24} att {fit.attack[i]:+.2f}  déf {fit.defense[i]:+.2f}")


# --- Diagnostic & reset (réponse aux conditions : vérifiable, borné, compté) ---
_SQL_CURRENT_NO_HISTORY = """
    select l.provider_ref, t.nom
      from teams t join leagues l on l.id = t.league_id
     where exists (select 1 from fixtures f
                    where (f.team_home_id = t.id or f.team_away_id = t.id)
                      and f.provider_ref not like 'fd:%%')      -- a un match COLLECTÉ (équipe actuelle)
       and not exists (select 1 from fixtures f
                        where (f.team_home_id = t.id or f.team_away_id = t.id)
                          and f.provider_ref like 'fd:%%')      -- mais AUCUN historique football-data
     order by l.provider_ref, t.nom
"""


def current_without_history() -> list[tuple[str, str]]:
    with connect() as con, con.cursor() as cur:
        cur.execute(_SQL_CURRENT_NO_HISTORY)
        return [(fd, nom) for fd, nom in cur.fetchall()]


def list_teams() -> None:
    """Dump des équipes par ligue (pour lire les VRAIS noms The Odds API)."""
    with connect() as con, con.cursor() as cur:
        cur.execute("""select l.provider_ref, t.nom from teams t
                        join leagues l on l.id = t.league_id order by l.provider_ref, t.nom""")
        rows = cur.fetchall()
    by_lg: dict[str, list[str]] = {}
    for fd, nom in rows:
        by_lg.setdefault(fd, []).append(nom)
    for fd, noms in by_lg.items():
        print(f"\n{fd} ({len(noms)}) : " + " · ".join(noms))


def count_fd() -> tuple[int, int]:
    """Compte, SANS rien supprimer, les lignes issues du backfill (préfixe fd:)."""
    with connect() as con, con.cursor() as cur:
        cur.execute("select count(*) from fixtures where provider_ref like 'fd:%%'")
        n_fixtures = cur.fetchone()[0]
        # Équipes qui ne survivent que sur des matchs fd (aucun match collecté) → orphelines après purge.
        cur.execute("""select count(*) from teams t where not exists (
                         select 1 from fixtures f
                          where (f.team_home_id = t.id or f.team_away_id = t.id)
                            and f.provider_ref not like 'fd:%%')""")
        n_teams = cur.fetchone()[0]
    print(f"À supprimer (backfill uniquement) : fixtures fd: {n_fixtures}  ·  équipes orphelines : {n_teams}")
    print("(Les matchs et cotes du collecteur ne sont PAS touchés.)")
    return n_fixtures, n_teams


def reset_backfill() -> None:
    """Supprime UNIQUEMENT les données du backfill (fd:) puis recharge."""
    with connect() as con, con.cursor() as cur:
        cur.execute("delete from fixtures where provider_ref like 'fd:%%'")
        nf = cur.rowcount
        cur.execute("""delete from teams t where not exists (
                         select 1 from fixtures f
                          where (f.team_home_id = t.id or f.team_away_id = t.id))""")
        nt = cur.rowcount
        print(f"Purge backfill : {nf} fixtures fd + {nt} équipes orphelines supprimées.")
    backfill()
    manquantes = current_without_history()
    print("\n" + "=" * 64)
    print(f"CIBLE — équipes ACTUELLES sans historique : {len(manquantes)}")
    print("=" * 64)
    if manquantes:
        for fd, nom in manquantes:
            print(f"  {fd}  {nom}")
    else:
        print("  (aucune) ✓  toutes les équipes actuelles ont leur historique.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill football-data + diagnostics.")
    ap.add_argument("--list-teams", action="store_true", help="dump des équipes en base (lecture)")
    ap.add_argument("--count", action="store_true", help="compte les lignes fd: à supprimer (lecture)")
    ap.add_argument("--reset", action="store_true", help="purge fd: puis recharge")
    args = ap.parse_args()
    if args.list_teams:
        list_teams()
    elif args.count:
        count_fd()
    elif args.reset:
        reset_backfill()
    else:
        backfill()


if __name__ == "__main__":
    main()
