"""Connexion Postgres du job Python. Une seule variable : MTJ_DATABASE_URL.

C'est la MÊME base que l'application (brief : Postgres/Supabase). Le job Python
ÉCRIT ; l'application ne fait que LIRE. On se connecte en direct (chaîne Postgres
du pooler Supabase), pas via le SDK — un job batch écrit mieux en SQL direct.

    export MTJ_DATABASE_URL='postgresql://…:6543/postgres'   # pooler Supabase
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, timezone

import psycopg

ENV_URL = "MTJ_DATABASE_URL"


def dsn() -> str:
    url = os.environ.get(ENV_URL)
    if not url:
        raise SystemExit(
            f"{ENV_URL} absent. Renseigne la chaîne Postgres (pooler Supabase) "
            "avant de lancer le pipeline."
        )
    return url


@contextmanager
def connect():
    """Connexion transactionnelle (commit explicite, rollback si exception)."""
    with psycopg.connect(dsn()) as con:
        try:
            yield con
            con.commit()
        except Exception:
            con.rollback()
            raise


def window_6h(now: datetime | None = None) -> datetime:
    """Début de la fenêtre de 6 h courante (00/06/12/18 h UTC) — clé d'idempotence
    du collecteur : deux relèves dans la même fenêtre écrivent la même ligne."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return now.replace(hour=(now.hour // 6) * 6, minute=0, second=0, microsecond=0)
