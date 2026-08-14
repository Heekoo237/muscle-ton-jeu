"""
catalogue.py — Catalogue des compétitions football chez le fournisseur de cotes
(The Odds API), pour décider la couverture.

Appel /v4/sports (GRATUIT : il ne consomme AUCUN crédit du quota). Lecture seule,
aucun écrit en base. Sert à répondre : quelles compétitions existent, lesquelles
sont actives maintenant, et combien coûterait de les couvrir.

Modèle de coût vérifié sur nos chiffres réels (11 ligues × 4 relevés/j × 30 j ×
2 marchés × 1 région = 2 640 crédits/mois) :
    crédits/mois = compétitions × relevés/jour × 30 × marchés × régions
Soit, au rythme actuel (4/j, 2 marchés, 1 région) : 240 crédits/mois/compétition.
"""

import json
import os
import urllib.request

API = "https://api.the-odds-api.com/v4/sports/"
QUOTA_PALIER = 20_000  # crédits/mois du palier ~30 $


def _fetch(key: str) -> list[dict]:
    url = f"{API}?all=true&apiKey={key}"
    with urllib.request.urlopen(url, timeout=30) as r:  # noqa: S310 (URL de confiance)
        return json.load(r)


def _cost(n: int, pulls: int, markets: int, regions: int = 1) -> int:
    return n * pulls * 30 * markets * regions


def main() -> None:
    key = os.environ.get("MTJ_PROVIDER_KEY", "").strip()
    if not key:
        raise SystemExit("MTJ_PROVIDER_KEY manquante (secret GitHub).")

    data = _fetch(key)
    soccer = [s for s in data if s.get("group") == "Soccer" or s.get("key", "").startswith("soccer_")]
    active = [s for s in soccer if s.get("active")]
    inactive = [s for s in soccer if not s.get("active")]

    print(f"FOOTBALL — {len(soccer)} compétitions au catalogue, {len(active)} ACTIVES.\n")

    print("=== ACTIVES (couvrables maintenant) ===")
    for s in sorted(active, key=lambda s: s["key"]):
        print(f"  ● {s['key']:<42} {s.get('title', '')}")

    print(f"\n=== INACTIVES / hors-saison ({len(inactive)}) ===")
    for s in sorted(inactive, key=lambda s: s["key"]):
        print(f"  ○ {s['key']:<42} {s.get('title', '')}")

    n = len(active)
    print("\n=== COÛT pour couvrir TOUTES les actives (crédits/mois) ===")
    print(f"  {n} × 2 marchés × 4 relevés/j = {_cost(n, 4, 2):>7}   (rythme actuel)")
    print(f"  {n} × 2 marchés × 2 relevés/j = {_cost(n, 2, 2):>7}   (secondaires ralenties)")
    print(f"  {n} × 3 marchés × 4 relevés/j = {_cost(n, 4, 3):>7}   (+ BTTS comme 3e marché)")
    print(f"  Quota du palier actuel        = {QUOTA_PALIER:>7}")
    tient = _cost(n, 4, 2) <= QUOTA_PALIER
    print(f"\n  → Tout le catalogue actif tient dans le quota (2 marchés, 4/j) : {'OUI' if tient else 'NON'}")
    if not tient:
        max_comp = QUOTA_PALIER // (4 * 30 * 2)
        print(f"    Plafond à 4/j, 2 marchés : {max_comp} compétitions. Au-delà : ralentir ou palier suivant.")


if __name__ == "__main__":
    main()
