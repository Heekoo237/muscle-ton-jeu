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


# ── Source de probabilité PAR MARCHÉ (architecture hybride) ──────────────────
# Le backtest (étape 4.0) a tranché : sur le 1X2 et le plus/moins 2,5, la cote
# d'OUVERTURE dé-vigée bat le modèle et la fusion ne retient rien du modèle
# (w = 0 en validation croisée). Sur les marchés SANS cote, le modèle est seul et
# bien calibré (ECE 1,5-3 %). On lit donc la cote quand elle existe, et le modèle
# sinon. Le pipeline nocturne fait les deux.
#
#   "odds"  → cote d'ouverture dé-vigée (puissance) ; le modèle n'est qu'un repli.
#   "model" → probabilité du modèle Dixon-Coles (aucune cote de référence).
#
# ⚠️ Repli obligatoire : si la cote est indisponible pour un marché "odds", le
#    modèle prend le relais AVEC CONFIANCE ABAISSÉE (voir CONFIDENCE_ON_FALLBACK).
PROBABILITY_SOURCE = {
    "WIN_HOME": "odds", "DRAW": "odds", "WIN_AWAY": "odds",   # 1X2
    "OVER_2_5": "odds", "UNDER_2_5": "odds",                  # plus/moins 2,5
    "DC_HOME_DRAW": "model", "DC_DRAW_AWAY": "model", "DC_HOME_AWAY": "model",
    "OVER_1_5": "model", "OVER_3_5": "model",                 # plus/moins 1,5 & 3,5
    # BTTS SUSPENDU (biais +3,3 pt, non constant : -1,6 Bundesliga à +7,4 La Liga).
    # Ré-ouvrir seulement après correction PAR LIGUE. Voir README étape 4.
}
CONFIDENCE_ON_FALLBACK = "modérée"  # cote absente → modèle en repli, jamais "normale"


# ── Seuil de fragilité PAR MARCHÉ ────────────────────────────────────────────
# Une sélection est « fragile » si sa probabilité est SOUS le seuil de son marché.
# Définition retenue (étape 4.5) : PROBABILITÉ SEULE. Le désaccord modèle/marché
# et le mouvement de cote ont été testés et ÉCARTÉS — ils baissent la précision
# (étape 4.1/4.2) et le mouvement est inconnu au calcul nocturne.
#
# Chaque seuil est calé sur le MÊME point de fonctionnement que le 1X2 validé :
# marquer ~60 % des sélections du marché, rappel ~70 % des perdantes. Les seuils
# diffèrent parce que les probabilités sont structurellement plus hautes sur les
# marchés « sûrs » (une double chance médiane est à 0,78, un 1X2 à 0,50) — un
# seuil unique à 0,55 ne marquerait presque rien en double chance.
#
# HONNÊTETÉ SUR LE SIGNAL (référence 1X2, seuil 0,55) :
#   précision 54 %  ·  taux d'échec de base 45,6 %  →  le signal n'est que ~8 pt
#   au-dessus du hasard. Réel mais MODÉRÉ. Le plancher de 4 sélections (règle d'or
#   n°3) empêche de vider le ticket même quand beaucoup de sélections sont marquées.
FRAGILE_THRESHOLDS = {
    "WIN_HOME": 0.55, "DRAW": 0.55, "WIN_AWAY": 0.55,        # 1X2  (base échec 45,6 %)
    "DC_HOME_DRAW": 0.80, "DC_DRAW_AWAY": 0.80, "DC_HOME_AWAY": 0.80,  # double chance (base 22,2 %)
    "OVER_1_5": 0.79,     # plus de 1,5 (base 22,9 %)
    "OVER_2_5": 0.55,     # plus de 2,5 (base 46,6 %)
    "OVER_3_5": 0.33,     # plus de 3,5 (base 69,1 %)
    "UNDER_2_5": 0.51,    # moins de 2,5 (base 53,4 %)
}
FRAGILE_MIN_SELECTIONS = 4  # plancher du ticket renforcé (règle d'or n°3), jamais moins

# Trace des chiffres qui JUSTIFIENT le seuil 1X2, pour qu'ils restent visibles.
FRAGILE_1X2_PRECISION = 0.54       # part des sélections marquées qui tombent vraiment
FRAGILE_1X2_BASE_FAILURE = 0.456   # taux d'échec des favoris d'ouverture sans filtre


# ── Confiance affichée PAR CHAMPIONNAT ───────────────────────────────────────
# Classement par calibration (ECE sur le 1X2, étape 4.3). Aucun championnat n'est
# exclu : un ECE de 5-6 % n'est pas « mauvais », il est « imprécis » → on baisse la
# confiance affichée (champ prévu au PRD), on ne cache pas le championnat.
#   "normale" : ECE < 4 %   ·   "modérée" : 4-5,5 %   ·   "faible" : > 6 %
LEAGUE_CONFIDENCE = {
    "E0": "normale",   # Premier League    ECE 2,6 %
    "I1": "normale",   # Serie A           ECE 3,1 %
    "SP1": "normale",  # La Liga           ECE 3,6 %
    "B1": "normale",   # Jupiler Pro League ECE 4,2 %  (limite, voir README Belgique)
    "T1": "modérée",   # Süper Lig         ECE 4,8 %
    "F1": "modérée",   # Ligue 1           ECE 4,9 %
    "N1": "modérée",   # Eredivisie        ECE 4,9 %
    "P1": "modérée",   # Liga Portugal     ECE 5,2 %
    "D1": "modérée",   # Bundesliga        ECE 5,3 %
    "SC0": "modérée",  # Scottish Prem.    ECE 5,4 %
    "G1": "faible",    # Super League (Grèce) ECE 6,4 %
}
DEFAULT_CONFIDENCE = "modérée"  # championnat inconnu / non calibré
