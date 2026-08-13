"""Vérifie la COUVERTURE du fournisseur avant tout paiement — sans base.

    MTJ_PROVIDER=oddsapi MTJ_PROVIDER_KEY=<clé gratuite> \
        python -m mtj_model.pipeline.verify

Appelle /sports (gratuit, ne consomme pas de crédit) et confirme que nos 11
championnats sont présents ET actifs (en saison) chez The Odds API. Signale en
particulier les trois à risque : Écosse, Belgique, Grèce. Une clé fausse dans
la table de correspondance se corrige ensuite en une ligne.
"""
from __future__ import annotations

import sys

from ..constants import LEAGUE_CONFIDENCE, ODDS_API_KEYS
from .provider import get_provider

RISKY = {"SC0", "B1", "G1"}  # Écosse, Belgique, Grèce


def verify() -> list[str]:
    provider = get_provider()
    sports = provider.sports()
    active = {s.get("key") for s in sports if s.get("active")}
    present = {s.get("key") for s in sports}

    print(f"{'code':<5}{'clé The Odds API':<32}{'état':<12}confiance")
    print("-" * 62)
    missing: list[str] = []
    for fd, key in ODDS_API_KEYS.items():
        if key in active:
            etat = "actif"
        elif key in present:
            etat = "hors-saison"
        else:
            etat = "ABSENT"
            missing.append(fd)
        flag = "  ⚠️" if fd in RISKY else ""
        print(f"{fd:<5}{key:<32}{etat:<12}{LEAGUE_CONFIDENCE.get(fd, '?')}{flag}")
    return missing


def main() -> None:
    missing = verify()
    print()
    if missing:
        print(f"ATTENTION : {len(missing)} championnat(s) introuvable(s) chez le fournisseur : "
              f"{', '.join(missing)}.", file=sys.stderr)
        print("Corrige la clé dans constants.ODDS_API_KEYS et la migration 0006, puis relance.",
              file=sys.stderr)
        sys.exit(1)
    print("Les 11 championnats sont présents chez le fournisseur. Couverture OK.")


if __name__ == "__main__":
    main()
