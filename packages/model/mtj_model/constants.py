"""Constantes calibrées du modèle. Chaque valeur vient d'un calcul, jamais d'un
choix arbitraire — et porte la trace de sa justification.
"""
from __future__ import annotations

import math

# ── Pondération par récence ξ ────────────────────────────────────────────────
# Calibrée par vraisemblance PRÉDICTIVE walk-forward (voir calibrate.py) sur la
# saison 2024-25, 11 championnats, 3 462 matchs.
#
# La courbe log-vraisemblance vs demi-vie est PLATE de ~180 à ~540 jours : au
# sommet, les écarts (~0,002 nat/match) sont dans le bruit. L'optimum brut du MLE
# tombe vers ~500 jours, MAIS avec seulement 3 saisons le modèle a très peu de
# « vieux » matchs à sous-pondérer — une grande demi-vie coûte donc presque rien,
# et ~500 j est probablement SURESTIMÉ par construction.
#
# Décision : on se place au MILIEU du plateau (365 j), pas à son extrémité.
# ⚠️ À RECALIBRER quand on ajoutera des saisons : l'optimum pourrait raccourcir.
#
# ξ UNIQUE (pas par ligue) : vérifié par championnat, les optima ne basculent
# qu'entre 240 et 480 j sur des écarts dans le bruit (parfois 0,0001 nat/match).
# Avec ~230-380 matchs de test par ligue, une décote par championnat n'est pas
# identifiable — la régler reviendrait à surapprendre le bruit. On garde un ξ
# global ; c'est la calibration PAR CHAMPIONNAT (étape 4) qui décide de la
# couverture, pas ξ.
RECENCY_HALF_LIFE_DAYS = 365.0
XI_PER_DAY = math.log(2.0) / RECENCY_HALF_LIFE_DAYS  # ≈ 0.001899 par jour
