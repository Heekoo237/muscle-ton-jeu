"""Rattachement des données du fournisseur à notre schéma (upserts partagés).

Le fournisseur parle en noms d'équipes et en clés The Odds API ; notre base parle
en `league_id` / `team_id` / `fixture_id`. Ces helpers font le pont, de façon
idempotente (ré-exécutables sans doublon).

Rappel : `leagues.provider_ref` = code football-data (E0…) ; `league_catalog`
relie ce code à la clé The Odds API (soccer_epl…). C'est la table de
correspondance des deux référentiels.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import datetime

# Mots de « bruit » d'un nom de club : on les retire pour rapprocher les variantes.
_NOISE = {"fc", "cf", "sc", "ac", "afc", "cd", "ud", "rc", "sv", "bk", "if", "club", "de", "the"}
# Abréviations déterministes fréquentes (le reste vient de l'enrichissement d'alias).
_EXPAND = {"utd": "united", "man": "manchester", "spurs": "tottenham", "wolves": "wolverhampton"}


def normalize_team_name(raw: str) -> str:
    """Clé normalisée d'un nom d'équipe : minuscules, sans accents ni ponctuation,
    mots de bruit retirés, quelques abréviations déterministes développées.

    Le fournisseur de cotes n'utilise pas les mêmes noms que football-data
    (« Man Utd » vs « Manchester United »). On normalise DÈS L'ÉCRITURE en base,
    pas à la résolution. Les variantes que la normalisation ne peut pas deviner
    (abréviations propres à un bookmaker) sont couvertes par l'enrichissement
    d'alias, à chaque correction utilisateur.
    """
    s = unicodedata.normalize("NFD", raw.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    toks = [_EXPAND.get(t, t) for t in s.split() if t and t not in _NOISE]
    return " ".join(toks)


def league_worklist(con) -> list[dict]:
    """Les 11 championnats actifs, avec league_id, clé fournisseur et code modèle."""
    sql = """
        select l.id as league_id, c.odds_api_key, c.fd_code
          from leagues l
          join league_catalog c on c.fd_code = l.provider_ref
         where l.actif
         order by c.fd_code
    """
    with con.cursor() as cur:
        cur.execute(sql)
        return [{"league_id": r[0], "odds_api_key": r[1], "fd_code": r[2]} for r in cur.fetchall()]


def upsert_team(con, league_id: int, nom: str) -> int:
    """Renvoie le team_id, en dédupliquant sur la clé NORMALISÉE.

    La clé normalisée est stockée comme alias : deux variantes d'un même club
    (accents, « FC », abréviations connues) tombent sur la même équipe. Le nom
    d'affichage reste la première forme rencontrée. Normalisation à l'écriture.
    """
    key = normalize_team_name(nom)
    with con.cursor() as cur:
        # Rapproche par clé normalisée (alias) OU par nom exact (équipes créées
        # avant la normalisation) — et rétro-remplit la clé au passage.
        cur.execute(
            "select id, aliases from teams where league_id = %s and (%s = any(aliases) or nom = %s)",
            (league_id, key, nom),
        )
        row = cur.fetchone()
        if row:
            tid, aliases = row
            to_add = [a for a in (key, nom) if a not in (aliases or [])]
            if to_add:
                cur.execute("update teams set aliases = coalesce(aliases, '{}') || %s where id = %s", (to_add, tid))
            return tid
        cur.execute(
            "insert into teams (nom, league_id, aliases) values (%s, %s, %s) returning id",
            (nom, league_id, [key, nom] if key != nom else [key]),
        )
        return cur.fetchone()[0]


def upsert_fixture(
    con, provider_ref: str, league_id: int, home_id: int, away_id: int,
    date_utc: datetime, status: str,
    score_home: int | None = None, score_away: int | None = None,
) -> int:
    """Upsert d'un match par référence fournisseur ; renvoie fixture_id."""
    sql = """
        insert into fixtures
            (provider_ref, date_utc, team_home_id, team_away_id, league_id, statut, score_home, score_away)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (provider_ref) do update set
            statut     = excluded.statut,
            score_home = excluded.score_home,
            score_away = excluded.score_away,
            date_utc   = excluded.date_utc
        returning id
    """
    with con.cursor() as cur:
        cur.execute(sql, (provider_ref, date_utc, home_id, away_id, league_id, status, score_home, score_away))
        return cur.fetchone()[0]


def resolve_fixture(con, league_id: int, fx) -> int:
    """Un ProviderFixture/ProviderOdds → fixture_id (équipes créées au besoin)."""
    home_id = upsert_team(con, league_id, fx.home)
    away_id = upsert_team(con, league_id, fx.away)
    return upsert_fixture(
        con, fx.provider_ref if hasattr(fx, "provider_ref") else fx.fixture_ref,
        league_id, home_id, away_id, fx.date_utc,
        getattr(fx, "status", "scheduled"),
        getattr(fx, "score_home", None), getattr(fx, "score_away", None),
    )


def refresh_scores(con, provider, days_from: int = 3) -> int:
    """Rafraîchit les résultats récents de chaque championnat (nocturne)."""
    n = 0
    for lg in league_worklist(con):
        for fx in provider.scores(lg["odds_api_key"], days_from=days_from):
            if fx.status == "finished":
                resolve_fixture(con, lg["league_id"], fx)
                n += 1
    return n
