"""
quota.py — Garde-fou de PALIER. On a failli lancer un plan à 5 700 crédits/mois
sur un palier gratuit à 500. Ce module l'empêche : il lit le palier RÉEL chez le
fournisseur (jamais supposé) et refuse de démarrer si le plan mensuel le dépasse.

Deux chiffres, deux sources :
  - le PALIER détecté = restants + déjà consommés (en-têtes du fournisseur) ;
  - le PLAN mensuel = ce que la config prévoit de consommer (worklist × fréquence).
Si plan > palier, on alerte au démarrage — et par défaut on ARRÊTE, pour ne pas
brûler le peu qui reste sur un plan voué à échouer à mi-mois.
"""
from __future__ import annotations

import os

# Coût d'un relevé GROUPÉ /odds = marchés × régions (par compétition, pas par match).
MARKETS = 2  # h2h + totals
REGIONS = 1  # eu
DAYS = 30


def planned_monthly_credits(worklist: list[dict], markets: int = MARKETS, regions: int = REGIONS) -> int:
    """Crédits/mois prévus par la config : Σ championnats de (relevés/jour × 30 ×
    marchés × régions). Lit `releves_par_jour` de chaque ligne du worklist."""
    return sum(int(lg.get("releves_par_jour", 1)) * DAYS * markets * regions for lg in worklist)


def check_quota(quota: int | None, remaining: int | None, planned: int) -> tuple[bool, str]:
    """Décide si le plan tient dans le palier. Renvoie (ok, message lisible).

    ok=False si le palier est connu ET le plan le dépasse. Un palier inconnu
    (aucun en-tête encore) ne bloque pas — mais le message le dit franchement.
    """
    tete = f"[quota] palier détecté={quota if quota is not None else '?'} " \
           f"restants={remaining if remaining is not None else '?'} plan={planned} cr/mois"
    if quota is None:
        return True, tete + "  ⚠ palier inconnu (pas encore d'en-tête fournisseur)"
    if planned > quota:
        return False, (
            f"{tete}\n⛔ QUOTA INSUFFISANT : le plan mensuel ({planned}) DÉPASSE le "
            f"palier détecté ({quota}). Le collecteur s'arrête pour ne pas brûler les "
            f"{remaining if remaining is not None else '?'} crédits restants. "
            f"Passe à un palier ≥ {planned}, ou réduis la fréquence/le nombre de "
            f"compétitions. Forçage explicite : MTJ_ALLOW_OVER_QUOTA=1."
        )
    return True, tete + f"  ✓ tient ({planned} ≤ {quota})"


def assert_quota_ok(provider, worklist: list[dict]) -> None:
    """Journalise palier vs plan et ARRÊTE si le plan dépasse le palier détecté.

    À appeler APRÈS un appel gratuit (provider.sports()) qui a renseigné les
    en-têtes, et AVANT la boucle de collecte payante. Contournable, en toute
    conscience, par MTJ_ALLOW_OVER_QUOTA=1 (ex. palier tout juste relevé).
    """
    planned = planned_monthly_credits(worklist)
    quota = getattr(provider, "credits_quota", None)
    remaining = getattr(provider, "credits_remaining", None)
    ok, message = check_quota(quota, remaining, planned)
    print(message)
    if not ok and os.environ.get("MTJ_ALLOW_OVER_QUOTA") != "1":
        raise SystemExit(message)


def main() -> None:
    """Vérification du PALIER, gratuite et en LECTURE SEULE — à lancer après un
    (dés)abonnement pour confirmer que le nouveau palier est bien détecté.

    Appelle /sports (0 crédit), affiche le palier détecté et, si la base est
    joignable, le plan mensuel et le verdict. Ne collecte rien, n'écrit rien."""
    from .provider import NullProvider, get_provider

    provider = get_provider()
    if isinstance(provider, NullProvider):
        raise SystemExit("Fournisseur non branché — MTJ_PROVIDER=oddsapi + MTJ_PROVIDER_KEY.")
    provider.sports()  # gratuit : renseigne restants + déjà consommés → palier
    quota = provider.credits_quota
    remaining = provider.credits_remaining
    print(f"Palier détecté : {quota if quota is not None else '?'}   ·   "
          f"restants : {remaining if remaining is not None else '?'}")
    try:
        from .db import connect
        from .sync import league_worklist
        with connect() as con:
            worklist = league_worklist(con)
        planned = planned_monthly_credits(worklist)
        ok, message = check_quota(quota, remaining, planned)
        print(message)
        print("→ Après abonnement, tu dois voir un palier de 20 000 (et le plan qui tient).")
    except Exception as exc:  # base non joignable : le palier seul suffit à la vérif
        print(f"(plan mensuel non calculé — base non joignable : {str(exc)[:80]})")
        print("→ Après abonnement, tu dois voir « Palier détecté : 20000 ».")


if __name__ == "__main__":
    main()
