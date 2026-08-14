"""
probe_markets.py — SONDE empirique des marchés additionnels chez le fournisseur.

On ne SUPPOSE pas ce que The Odds API sert au-delà de h2h + totals — on demande,
sur un petit échantillon, en dépensant un nombre de crédits BORNÉ et AFFICHÉ.

Marchés additionnels visés : double_chance, btts, alternate_totals (toutes les
lignes plus/moins, dont 1,5 et 3,5). Ils vivent sur l'endpoint PAR ÉVÉNEMENT
(/events/{id}/odds), pas sur l'appel groupé — donc le coût est PAR MATCH, pas par
compétition. La sonde le mesure réellement (en-tête x-requests-last) pour qu'on
décide avec un chiffre, pas une intuition.

Rappel : la double chance n'a PAS besoin de ce marché — elle se DÉRIVE du 1X2
dé-vigé (P(1X)=P(1)+P(X)), gratuitement. On la sonde quand même pour comparer la
cote directe du fournisseur à notre dérivation.

Lecture seule, aucune écriture en base. Échantillon réglable via MTJ_PROBE_SAMPLE.
"""

import json
import os
import urllib.parse
import urllib.request

API = "https://api.the-odds-api.com/v4"
REGION = "eu"
ADDITIONAL = ["double_chance", "btts", "alternate_totals"]
SAMPLE = int(os.environ.get("MTJ_PROBE_SAMPLE", "4"))

_KEY = ""


def _get(path: str, params: dict) -> tuple[object, int, str | None]:
    q = {"apiKey": _KEY, **params}
    url = f"{API}/{path}?{urllib.parse.urlencode(q)}"
    req = urllib.request.Request(url, headers={"User-Agent": "mtj-probe/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (URL maîtrisée)
        cost = int(r.headers.get("x-requests-last") or 0)
        remaining = r.headers.get("x-requests-remaining")
        return json.loads(r.read()), cost, remaining


def main() -> None:
    global _KEY
    _KEY = os.environ.get("MTJ_PROVIDER_KEY", "").strip()
    if not _KEY:
        raise SystemExit("MTJ_PROVIDER_KEY manquante (secret GitHub).")

    sports, _, _ = _get("sports", {"all": "true"})
    active = [
        s["key"] for s in sports
        if s.get("active") and (s.get("group") == "Soccer" or s.get("key", "").startswith("soccer_"))
    ]

    total_cost = 0
    remaining: str | None = None
    probed = 0
    print(f"SONDE marchés additionnels — région {REGION}, marchés {', '.join(ADDITIONAL)}")
    print("(endpoint PAR ÉVÉNEMENT : coût par match. /events est gratuit.)\n")

    for key in active:
        if probed >= SAMPLE:
            break
        events, c_ev, remaining = _get(f"sports/{key}/events", {})  # gratuit (0 crédit)
        total_cost += c_ev
        if not events:
            continue  # compétition active mais sans match à venir : rien à sonder
        ev = events[0]
        eid = ev.get("id")
        try:
            odds, c_odds, remaining = _get(
                f"sports/{key}/events/{eid}/odds",
                {"regions": REGION, "markets": ",".join(ADDITIONAL), "oddsFormat": "decimal"},
            )
        except Exception as exc:  # marché non servi → réponse d'erreur, on note et continue
            print(f"  {key:<42} ✗ pas d'odds additionnels ({exc})")
            probed += 1
            continue
        total_cost += c_odds
        probed += 1

        # Quels marchés reviennent réellement, et chez quels bookmakers ?
        dispo: dict[str, set[str]] = {m: set() for m in ADDITIONAL}
        for book in odds.get("bookmakers", []):
            for m in book.get("markets", []):
                if m.get("key") in dispo:
                    dispo[m["key"]].add(book.get("key", "?"))
        regime = _regime(key)
        print(f"  {key:<42} [{regime}]  coût odds={c_odds} cr")
        for m in ADDITIONAL:
            books = dispo[m]
            etat = f"✓ {len(books)} book(s) : {', '.join(sorted(books))}" if books else "✗ absent"
            print(f"      {m:<18} {etat}")

    print(f"\nCompétitions sondées : {probed}   ·   crédits dépensés : {total_cost}", end="")
    if remaining is not None:
        print(f"   ·   restants sur le palier : {remaining}")
    else:
        print()
    print("Rappel : ce coût est PAR ÉVÉNEMENT. Étendre ces marchés à toutes les")
    print("compétitions × tous les matchs × chaque relevé est ce qui mange la marge.")


def _regime(key: str) -> str:
    from .catalogue import classify
    return {"modele": "modèle", "eligible": "éligible", "cote_seule": "cote seule"}[classify(key)]


if __name__ == "__main__":
    main()
