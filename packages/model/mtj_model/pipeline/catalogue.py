"""
catalogue.py — Catalogue des compétitions football chez le fournisseur de cotes
(The Odds API), pour décider la couverture ET le régime de chaque compétition.

Appel /v4/sports (GRATUIT : il ne consomme AUCUN crédit du quota). Lecture seule,
aucun écrit en base. Répond à trois questions :
  1. Quelles compétitions existent, lesquelles sont actives maintenant.
  2. Laquelle peut avoir un VRAI MODÈLE (historique football-data exploitable),
     laquelle reste en COTE SEULE — c'est le classement de régime.
  3. Combien coûterait de tout couvrir, à la FRÉQUENCE GRADUÉE réelle.

Modèle de coût vérifié (appel GROUPÉ /odds : coût = marchés × régions par
compétition, PAS par match) : au rythme actuel (h2h + totals = 2 marchés, région
eu = 1) c'est 2 crédits par relevé et par compétition.
"""

import json
import os
import urllib.request

from ..constants import ODDS_API_KEYS

API = "https://api.the-odds-api.com/v4/sports/"
QUOTA_PALIER = 20_000  # crédits/mois du palier ~30 $

# ── Régime : ce qui a (ou peut avoir) un vrai modèle vs ce qui reste en cote seule ─
# Les 11 championnats backtestés, déjà en régime MODÈLE (source de vérité :
# constants.ODDS_API_KEYS). Leur clé The Odds API.
MODEL_LIVE = set(ODDS_API_KEYS.values())

# Compétitions ÉLIGIBLES au modèle : football-data les price avec cotes de clôture
# sur ses fichiers principaux, donc on POURRAIT les onboarder (alias + co-occurrence
# + volume + calibration ECE). Clé The Odds API ATTENDUE → (code fd, libellé). Une
# clé attendue mais absente du catalogue actif est signalée : soit la clé diffère,
# soit le fournisseur ne la price pas. On ne suppose rien — on confronte au réel.
MODEL_ELIGIBLE_FD = {
    "soccer_efl_champ": ("E1", "Championship (Angleterre D2)"),
    "soccer_england_league1": ("E2", "League One (Angleterre D3)"),
    "soccer_england_league2": ("E3", "League Two (Angleterre D4)"),
    "soccer_germany_bundesliga2": ("D2", "2. Bundesliga (Allemagne D2)"),
    "soccer_italy_serie_b": ("I2", "Serie B (Italie D2)"),
    "soccer_spain_segunda_division": ("SP2", "La Liga 2 (Espagne D2)"),
    "soccer_france_ligue_two": ("F2", "Ligue 2 (France D2)"),
}


def classify(key: str) -> str:
    """Régime d'une compétition d'après sa clé The Odds API : 'modele' (backtesté,
    live), 'eligible' (football-data price → onboardable), ou 'cote_seule'."""
    if key in MODEL_LIVE:
        return "modele"
    if key in MODEL_ELIGIBLE_FD:
        return "eligible"
    return "cote_seule"


def _fetch(key: str) -> list[dict]:
    url = f"{API}?all=true&apiKey={key}"
    with urllib.request.urlopen(url, timeout=30) as r:  # noqa: S310 (URL de confiance)
        return json.load(r)


def _cost_graduee(n_modele: int, n_reste: int, markets: int = 2) -> int:
    """Coût mensuel à FRÉQUENCE GRADUÉE : modèle 4 relevés/j (on garde l'historique
    de mouvements), reste 1,5/j en moyenne (cote seule, pas de backtest de mouvement).
    Appel groupé : coût = compétitions × relevés/j × 30 × marchés × 1 région."""
    return round(n_modele * 4 * 30 * markets + n_reste * 1.5 * 30 * markets)


def main() -> None:
    key = os.environ.get("MTJ_PROVIDER_KEY", "").strip()
    if not key:
        raise SystemExit("MTJ_PROVIDER_KEY manquante (secret GitHub).")

    data = _fetch(key)
    soccer = [s for s in data if s.get("group") == "Soccer" or s.get("key", "").startswith("soccer_")]
    active = [s for s in soccer if s.get("active")]
    inactive = [s for s in soccer if not s.get("active")]
    active_keys = {s["key"] for s in active}

    modele = [s for s in active if classify(s["key"]) == "modele"]
    eligible = [s for s in active if classify(s["key"]) == "eligible"]
    cote = [s for s in active if classify(s["key"]) == "cote_seule"]

    print(f"FOOTBALL — {len(soccer)} compétitions au catalogue, {len(active)} ACTIVES.\n")

    print(f"=== RÉGIME MODÈLE — live, backtesté ({len(modele)}) ===")
    for s in sorted(modele, key=lambda s: s["key"]):
        print(f"  ● {s['key']:<44} {s.get('title', '')}")

    print(f"\n=== MODÈLE ÉLIGIBLE — football-data price, à onboarder ({len(eligible)}) ===")
    for s in sorted(eligible, key=lambda s: s["key"]):
        fd = MODEL_ELIGIBLE_FD[s["key"]][1]
        print(f"  ◐ {s['key']:<44} {s.get('title', '')}  [fd: {fd}]")
    absentes = [(k, v[1]) for k, v in MODEL_ELIGIBLE_FD.items() if k not in active_keys]
    if absentes:
        print("  — attendues mais ABSENTES du catalogue actif (clé à corriger ou non price) :")
        for k, lib in absentes:
            print(f"      · {k:<42} {lib}")

    print(f"\n=== COTE SEULE — pas d'historique backtesté ({len(cote)}) ===")
    for s in sorted(cote, key=lambda s: s["key"]):
        print(f"  ○ {s['key']:<44} {s.get('title', '')}")

    print(f"\n=== INACTIVES / hors-saison ({len(inactive)}) — s'activeront seules via catalogue_sync ===")
    for s in sorted(inactive, key=lambda s: s["key"]):
        print(f"  · {s['key']:<44} {s.get('title', '')}")

    # Coût : tout le catalogue actif, à fréquence graduée. « reste » = éligible non
    # encore promu + cote seule ; tant qu'une éligible n'est pas onboardée, elle
    # tourne en cote seule (1,5/j), donc elle compte dans « reste ».
    n_modele = len(modele)
    n_reste = len(eligible) + len(cote)
    c2 = _cost_graduee(n_modele, n_reste, markets=2)
    c3 = _cost_graduee(n_modele, n_reste, markets=3)
    print("\n=== COÛT MENSUEL — fréquence graduée (modèle 4/j · reste 1,5/j) ===")
    print(f"  {n_modele} modèle + {n_reste} reste, 2 marchés (h2h+totals) = {c2:>6} crédits")
    print(f"  idem + BTTS comme 3e marché groupé*                   = {c3:>6} crédits")
    print(f"  Quota du palier                                       = {QUOTA_PALIER:>6}")
    print(f"  → tient dans le quota (2 marchés) : {'OUI' if c2 <= QUOTA_PALIER else 'NON'}")
    print("  * NB : double_chance/1,5/3,5/btts additionnels vivent sur l'endpoint PAR")
    print("    ÉVÉNEMENT (coût par match, pas par compétition) — voir probe_markets.")


if __name__ == "__main__":
    main()
