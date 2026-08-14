"""Carte d'alias CURÉE — football-data → The Odds API, pour la queue que
l'inclusion de jetons ne peut pas deviner (abréviations internes).

Chaque entrée mappe une CLÉ NORMALISÉE football-data vers la CLÉ NORMALISÉE du
même club chez The Odds API. Règle de sûreté : une entrée fausse fusionnerait
DEUX clubs différents — pire que de les laisser séparés. Chaque ligne doit donc
être vérifiable (les deux noms d'origine en commentaire).

⚠️ À remplir avec les VRAIS noms The Odds API (dump des équipes en base), jamais
devinés. Tant qu'elle est vide, seul l'appariement par jetons opère.
"""
from __future__ import annotations

# clé normalisée football-data  ->  clé normalisée The Odds API
CURATED_ALIASES: dict[str, str] = {
    # À compléter après le diagnostic, ex. :
    # "nottm forest": "nottingham forest",   # « Nott'm Forest » -> « Nottingham Forest »
}
