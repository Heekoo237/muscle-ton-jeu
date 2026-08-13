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
    "OVER_1_5": "model", "UNDER_1_5": "model",                # plus/moins 1,5
    "OVER_3_5": "model", "UNDER_3_5": "model",                # plus/moins 3,5
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
# POINT DE FONCTIONNEMENT = DÉCISION PRODUIT (30 %), pas une convention. Les
# courbes précision/rappel (fragile.py, _pr_curves) montrent que sur les marchés
# « cote » la précision monte quand on marque moins ; l'elbow est à ~30 % de
# sélections marquées (1X2 : précision 60 % vs 56 % à 60 %). En dessous (20 %) on
# ne gagne que +2 pt de précision pour −12 pt de rappel. On marque donc PEU et
# JUSTE. Chaque seuil = 30ᵉ centile de la proba affichée du marché.
#
# HONNÊTETÉ SUR LE SIGNAL (1X2, au point 30 %) :
#   précision 60 %  ·  taux d'échec de base 45,6 %  →  ~14 pt au-dessus du hasard.
#   Réel mais modéré. Le plancher de 4 sélections (règle d'or n°3) empêche de
#   vider le ticket même quand plusieurs sélections sont marquées.
FRAGILE_OPERATING_POINT = 0.30  # fraction de sélections marquées (décision produit)
FRAGILE_THRESHOLDS = {
    "WIN_HOME": 0.44, "DRAW": 0.44, "WIN_AWAY": 0.44,        # 1X2  (base échec 45,7 %)
    "DC_HOME_DRAW": 0.74, "DC_DRAW_AWAY": 0.74, "DC_HOME_AWAY": 0.74,  # double chance (base 22,3 %)
    "OVER_1_5": 0.72,     # plus de 1,5 (base 23,0 %)
    "UNDER_1_5": 0.18,    # moins de 1,5 (base 77 %)
    "OVER_2_5": 0.48,     # plus de 2,5 (base ~43 %)
    "UNDER_2_5": 0.42,    # moins de 2,5
    "OVER_3_5": 0.24,     # plus de 3,5 (base 69,2 %)
    "UNDER_3_5": 0.63,    # moins de 3,5 (base 31 %)
}
FRAGILE_MIN_SELECTIONS = 4  # plancher du ticket renforcé (règle d'or n°3), jamais moins

# Trace des chiffres qui JUSTIFIENT le seuil 1X2, pour qu'ils restent visibles.
FRAGILE_1X2_PRECISION = 0.60       # au point 30 % : part des marquées qui tombent
FRAGILE_1X2_BASE_FAILURE = 0.457   # taux d'échec des favoris d'ouverture sans filtre

# ── Badge « fragile » visible vs retrait silencieux mais jamais muet ──────────
# Sur les marchés « modèle sûr » (double chance, plus de 1,5), la précision est
# PLATE ~28 % quel que soit le seuil (fragile.py) : le modèle ne sait pas classer
# les échecs. Y afficher un badge « fragile » rouge crierait au loup (on marquerait
# des sélections qui passent 3 fois sur 4). Décision produit :
#   - Badge « fragile » VISIBLE seulement là où la précision dépasse ~50 %.
#   - Sur les autres marchés, la sélection sert au classement interne du retrait ;
#     si le renforcement la retire, on l'explique par une MENTION NEUTRE (voir
#     FRAGILE_NEUTRAL_MENTION) — « on retire sans crier au loup, jamais en silence ».
FRAGILE_BADGE_VISIBLE = {
    "WIN_HOME": True, "DRAW": True, "WIN_AWAY": True,   # 1X2 — précision ~60 %
    "OVER_2_5": True, "UNDER_2_5": True,                # plus/moins 2,5 — ~50 %
    "OVER_3_5": True, "UNDER_1_5": True,                # échec fréquent → précision ~80 %
    "DC_HOME_DRAW": False, "DC_DRAW_AWAY": False, "DC_HOME_AWAY": False,  # double chance
    "OVER_1_5": False, "UNDER_3_5": False,             # marchés « sûrs » — précision plate
}
FRAGILE_NEUTRAL_MENTION = "la moins solide de ton ticket"  # retrait sans badge « fragile »


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

# Traduction label → valeur numérique (colonne predictions.confiance, NUMERIC).
CONFIDENCE_VALUE = {"normale": 1.0, "modérée": 0.66, "faible": 0.33}

# Correspondance des deux référentiels de championnat : code football-data (clé du
# modèle) → clé The Odds API (clé du fournisseur de cotes). DOIT rester synchronisé
# avec la table `league_catalog` (migration 0006). Sert à `verify` sans base.
ODDS_API_KEYS = {
    "E0": "soccer_epl",
    "F1": "soccer_france_ligue_one",
    "SP1": "soccer_spain_la_liga",
    "I1": "soccer_italy_serie_a",
    "D1": "soccer_germany_bundesliga",
    "P1": "soccer_portugal_primeira_liga",
    "B1": "soccer_belgium_first_div",
    "N1": "soccer_netherlands_eredivisie",
    "T1": "soccer_turkey_super_league",
    "G1": "soccer_greece_super_league",
    "SC0": "soccer_spl",
}


def confidence_for(league_code: str, source: str) -> float:
    """Confiance numérique d'une prédiction, selon la ligue et la source.

    - source "odds"  : le marché a fixé le prix → confiance « normale ».
    - source "model" : confiance = palier de calibration du championnat (4.3).
    - source "repli" : cote attendue mais absente → jamais mieux que « modérée »
      (règle CONFIDENCE_ON_FALLBACK), et jamais au-dessus du palier de la ligue.
    """
    league = LEAGUE_CONFIDENCE.get(league_code, DEFAULT_CONFIDENCE)
    if source == "odds":
        label = "normale"
    elif source == "repli":
        # le minimum (plus prudent) entre le repli et le palier de la ligue
        order = ("faible", "modérée", "normale")
        label = min(CONFIDENCE_ON_FALLBACK, league, key=order.index)
    else:  # model
        label = league
    return CONFIDENCE_VALUE[label]
