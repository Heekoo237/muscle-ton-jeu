"""version.py — QUEL COMMIT ce job exécute-t-il ?

La leçon (CLAUDE.md) : un diagnostic sur des données produites par du code INCONNU
ne vaut rien. On a perdu des heures parce que le code testé n'était pas le code
exécuté. Chaque job planifié imprime donc, en PREMIÈRE ligne de son log, le commit
qu'il tourne — pour qu'on ne suppose plus jamais, on lise.
"""
from __future__ import annotations

import os
import subprocess


def running_commit() -> str:
    """SHA du commit exécuté. `GITHUB_SHA` en CI (GitHub Actions), sinon `git` local."""
    sha = os.environ.get("GITHUB_SHA")
    if sha:
        return sha
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:  # noqa: BLE001 — l'absence de git ne doit jamais casser un job
        return "inconnu"


def print_banner(job: str) -> None:
    """Bannière de version en tête de job : `[job] commit <sha8> (<ref>)`."""
    sha = running_commit()
    court = sha[:8] if sha != "inconnu" else sha
    ref = os.environ.get("GITHUB_REF_NAME", "")
    ref_txt = f" ({ref})" if ref else ""
    print(f"[{job}] commit {court}{ref_txt}")
