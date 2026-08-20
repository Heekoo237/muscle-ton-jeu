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

# Marchés dont la probabilité vient de la COTE (le repli n'a de sens que là).
ODDS_MARKETS = frozenset(m for m, s in PROBABILITY_SOURCE.items() if s == "odds")

# ── Alerte couverture cote ───────────────────────────────────────────────────
# Un marché coté (1X2, plus/moins 2,5) qui retombe massivement au modèle (repli)
# signale une panne de couverture chez le fournisseur, pas un choix produit. Le
# nocturne journalise le taux de repli PAR MARCHÉ ET PAR LIGUE ; au-delà de ce
# seuil la surveillance alerte — un marché coté à 80 % de repli doit se voir sans
# lire un échantillon. Seuil à 50 % : on veut le voir monter, pas attendre pire.
REPLI_ALERT = 0.50

# Repli COTE SEULE des promus dans un championnat MODÈLE : normal en début de saison
# (équipes montées, pas encore d'historique), mais un tiers durablement en repli veut
# dire qu'on ne modélise plus vraiment ce championnat. Au-delà de ce seuil, sur un
# MOIS GLISSANT (pas un run isolé, trop bruité en début de saison), la surveillance
# alerte. Sous garde-fous d'échantillon (assez de runs et de matchs) pour ne pas
# crier au jour 2.
REPLI_PROMU_ALERT = 0.40
REPLI_PROMU_MIN_RUNS = 5     # au moins 5 nocturnes dans la fenêtre avant d'alerter
REPLI_PROMU_MIN_MATCHS = 30  # au moins 30 matchs-fenêtre cumulés (anti-bruit)

# Lecture VISION incomplète (marché reconnu, issue vide) : la vision n'est pas
# déterministe ; un taux qui grimpe = une dérive qu'on ne verrait jamais en lisant
# les logs à la main. Au-delà du seuil sur la journée, la surveillance alerte. Sous
# garde-fou d'échantillon (assez de lignes lues) pour ne pas crier sur deux tickets.
VISION_INCOMPLETE_ALERT = 0.20
VISION_INCOMPLETE_MIN_LIGNES = 20

# ── Escalade vers alternate_totals (Pinnacle 2,5 garanti) — critère CHIFFRÉ ───
# Le plus/moins 2,5 est pris chez le book EU le plus serré qui le poste (gratuit).
# On n'escalade vers `alternate_totals` (+50 % de crédits sur l'appel cotes) que
# si ce 2,5 coûte trop en marge, LARGEMENT et DURABLEMENT :
#   marge OU-2,5 moyenne du book serveur > 8 %  sur > 3 ligues,  tenu ≥ 3 nocturnes.
# En deçà, la version gratuite reste préférable. « Une décision reportée sans
# critère est une décision jamais prise » : ce seuil EST la décision. Chiffres
# provisoires, à rejuger à la prochaine recalibration (voir README, écarts connus).
ALT_TOTALS_MARGIN_PCT = 8.0
ALT_TOTALS_MIN_LEAGUES = 3
ALT_TOTALS_MIN_NIGHTS = 3


# ── Seuil de RETRAIT par marché (≠ badge, voir plus bas) ─────────────────────
# DEUX NOTIONS DISTINCTES, DEUX RÉGLAGES DISTINCTS (ne jamais les recoupler) :
#   1. le SEUIL DE RETRAIT (ci-dessous) — qui devient candidat au retrait ;
#   2. la VISIBILITÉ DU BADGE (FRAGILE_BADGE_VISIBLE, plus bas) — qui reçoit le
#      badge rouge « trop juste ».
# Le seuil gouverne l'ARITHMÉTIQUE (retirer la jambe faible monte la proba
# combinée — honnête quel que soit le badge). Le badge gouverne la PRÉTENTION
# de détection, dérivée du gain + marquage.
#
# Une sélection est candidate au retrait si sa probabilité est SOUS le seuil de
# son marché. Définition retenue (étape 4.5) : PROBABILITÉ SEULE.
#
# POINT DE FONCTIONNEMENT = DÉCISION PRODUIT (30 %). Chaque seuil est le 30ᵉ
# centile de la proba affichée de SON marché — Y COMPRIS chaque issue du 1X2 et
# de la double chance (Direction 2, recalibrage PAR ISSUE). L'ancien seuil PARTAGÉ
# (1X2 à 0,44 hérité du favori, DC à 0,74 hérité du « 12 ») sur-marquait les deux
# autres issues : le nul, jamais au-dessus de 0,31, était marqué à 100 % pour un
# gain nul. Mesuré sur les tickets de test : 59 % des retraits étaient des nuls.
# Après recalibrage (fragile.py, 3 459 matchs) chaque issue marque ~30 %, gain
# positif partout (nul +6,1 · dom +24 · ext +20 · 1X +20 · X2 +23) — voir README.
FRAGILE_OPERATING_POINT = 0.30  # fraction de sélections marquées (décision produit)
FRAGILE_THRESHOLDS = {
    # 1X2 — recalibré PAR ISSUE (30ᵉ centile de la cote dé-vigée de chaque issue).
    "WIN_HOME": 0.33,  # dom. — marque 29 %, gain +24,0
    "DRAW": 0.22,      # nul  — marque 29 %, gain +6,1  (n'est plus le drap à 100 %)
    "WIN_AWAY": 0.20,  # ext. — marque 30 %, gain +19,6
    # Double chance — recalibrée PAR ISSUE (30ᵉ centile de la proba modèle de chacune).
    "DC_HOME_DRAW": 0.61,  # 1X — marque 31 %, gain +19,9
    "DC_DRAW_AWAY": 0.47,  # X2 — marque 30 %, gain +23,2
    "DC_HOME_AWAY": 0.73,  # 12 — marque 34 %, gain +2,6 (déjà bien calé, ~inchangé)
    "OVER_1_5": 0.72,     # plus de 1,5 (base 23,0 %)  — calé sur son marché
    "UNDER_1_5": 0.18,    # moins de 1,5 (base 77 %)   — calé sur son marché
    "OVER_2_5": 0.48,     # plus de 2,5 (base ~43 %)   — calé sur son marché
    "UNDER_2_5": 0.42,    # moins de 2,5               — calé sur son marché
    "OVER_3_5": 0.24,     # plus de 3,5 (base 69,2 %)  — calé sur son marché
    "UNDER_3_5": 0.63,    # moins de 3,5 (base 31 %)   — calé sur son marché
}
FRAGILE_MIN_SELECTIONS = 4  # plancher du ticket renforcé (règle d'or n°3), jamais moins

# ── Régime COTE SEULE : barre de RETRAIT différenciée par issue (PROVISOIRE) ──
# Sur un championnat non backtesté, on n'a AUCUNE calibration — donc AUCUN badge
# (la précision n'est pas mesurée). MAIS l'ancien bar UNIQUE (0,50) était cassé par
# famille : un nul (cote dé-vigée ~0,25) n'atteint jamais 0,50 → marqué à 100 %,
# comme un favori à 0,50. Deux comportements pour une même échelle.
#
# CE QU'ON UTILISE, ET CE QU'ON NE PRÉTEND PAS : on ne peut pas mesurer le POINT
# DE FONCTIONNEMENT ici (quels nuls tombent vraiment plus → backtest requis). Mais
# l'ÉCHELLE d'une issue se LIT dans la cote elle-même, sans résultat. On transpose
# donc la distribution de la cote dé-vigée PAR ISSUE, observée sur nos championnats
# MODÉLISÉS (fragile.py, 30ᵉ centile — le même point de fonctionnement produit) :
#   dom 0,33 · nul 0,22 · ext 0,20   |   1X 0,62 · X2 0,45 · 12 0,72   |   +2,5 0,48 · −2,5 0,42
# Pour le 1X2 et le plus/moins 2,5, l'entrée est la MÊME cote dé-vigée dans les deux
# régimes → ce sont exactement les seuils modélisés. La DC dérivée (somme des cotes)
# a sa propre échelle, mesurée à part. Reconnaissance d'échelle, PAS une calibration.
#
# PROVISOIRE. Condition de sortie : un vrai backtest de ces championnats → on
# remplace par des q30 MESURÉS et on rallume le badge. D'ici là : mention neutre.
FRAGILE_THRESHOLD_COTE_SEULE = 0.50  # conservé pour repli/compat ; ne plus utiliser directement
FRAGILE_THRESHOLD_COTE_SEULE_BY_MARKET = {
    "WIN_HOME": 0.33, "DRAW": 0.22, "WIN_AWAY": 0.20,               # = échelle 1X2 (cote dé-vigée)
    "DC_HOME_DRAW": 0.62, "DC_DRAW_AWAY": 0.45, "DC_HOME_AWAY": 0.72,  # échelle DC DÉRIVÉE
    "OVER_2_5": 0.48, "UNDER_2_5": 0.42,                           # = échelle plus/moins 2,5
    # OVER/UNDER 1,5 et 3,5 : jamais produits en cote seule (modèle only) — repli prudent.
    "OVER_1_5": 0.72, "UNDER_1_5": 0.18, "OVER_3_5": 0.24, "UNDER_3_5": 0.63,
}

# Trace des chiffres qui JUSTIFIENT le seuil 1X2, pour qu'ils restent visibles.
FRAGILE_1X2_PRECISION = 0.60       # au point 30 % : part des marquées qui tombent
FRAGILE_1X2_BASE_FAILURE = 0.457   # taux d'échec des favoris d'ouverture sans filtre

# ── Badge « trop juste » — critère OBJECTIF : GAIN sur la base, jamais précision ─
# ERREUR DE FOND CORRIGÉE : l'ancien critère « précision absolue > ~50 % »
# allumait le badge sur le NUL (précision 75 %) — or 75 % est le TAUX DE BASE du
# nul, pas de la détection : on marquait 100 % des nuls pour un GAIN de +0,0 pt.
# Un badge sur 100 % (ou 51 %) des lignes ne se lit plus. Le bon critère mesure ce
# que le marquage AJOUTE, et exige qu'il reste RARE :
#
#   Badge affiché  ⇔  gain sur la base ≥ 5 pts  ET  taux de marquage ≤ 40 %.
#
# Les DEUX conditions. Le gain écarte le drap (nul). Le marquage écarte les seuils
# partagés qui sur-marquent (1X2, DC) même quand leur gain est réel — un badge
# doit rester rare pour être crédible. Règle générale : un seuil se valide par son
# GAIN sur la base, jamais par sa précision absolue (README).
#
# Chiffres mesurés APRÈS recalibrage par issue (fragile.py, 3 459 matchs) — gain · marquage :
#   WIN_HOME +24,0 · 29 %   DRAW +6,1 · 29 %   WIN_AWAY +19,6 · 30 %
#   DC_HOME_DRAW +19,9 · 31 %   DC_DRAW_AWAY +23,2 · 30 %   DC_HOME_AWAY +2,6 · 34 %
#   OVER_1_5 +6,1 · 31 %   OVER_2_5 +10,0 · 31 %   OVER_3_5 +9,3 · 30 %
#   UNDER_1_5 +6,7 · 29 %   UNDER_2_5 +12,2 · 31 %   UNDER_3_5 +10,4 · 29 %
#
# INTÉRIM LEVÉ (Direction 2) : chaque issue marque ~30 %, donc TOUS les marchés
# sauf « l'un ou l'autre » (12) remplissent (gain ≥ 5 ET marquage ≤ 40 %) → le
# badge revient MÉRITÉ. Le nul badge à nouveau, mais sur les 30 % les plus justes
# seulement (+6,1 de gain), plus le drap à 100 %. Seul le 12 reste neutre (+2,6).
# Ne PAS rallumer un badge à la main en voyant « le gain est positif » sans
# regarder le marquage — c'est le raccourci qui avait produit le seuil partagé.
FRAGILE_BADGE_MIN_GAIN = 5.0       # gain sur la base minimal (points) pour un badge
FRAGILE_BADGE_MAX_MARKING = 0.40   # marquage maximal — un badge doit rester rare
FRAGILE_BADGE_VISIBLE = {
    # Dérivé du critère ci-dessus sur les chiffres mesurés. Régénérer via fragile.py
    # (routine _badge_decision) à chaque recalibrage — ne pas éditer à la main isolément.
    "WIN_HOME": True,       # +24,0 · 29 % ✓
    "DRAW": True,           # +6,1 · 29 % ✓  (recalibré : marque les 30 % les plus justes)
    "WIN_AWAY": True,       # +19,6 · 30 % ✓
    "DC_HOME_DRAW": True,   # +19,9 · 31 % ✓
    "DC_DRAW_AWAY": True,   # +23,2 · 30 % ✓
    "DC_HOME_AWAY": False,  # +2,6 · 34 % — gain trop faible (< 5), reste neutre
    "OVER_1_5": True,       # +6,1 · 31 % ✓
    "OVER_2_5": True,       # +10,0 · 31 % ✓
    "OVER_3_5": True,       # +9,3 · 30 % ✓
    "UNDER_1_5": True,      # +6,7 · 29 % ✓
    "UNDER_2_5": True,      # +12,2 · 31 % ✓
    "UNDER_3_5": True,      # +10,4 · 29 % ✓
}
FRAGILE_NEUTRAL_MENTION = "la moins solide de ton ticket"  # retrait sans badge « trop juste »


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
    - source "repli" / "model_marge_excessive" : la cote attendue est absente ou
      trop margée pour être fiable → jamais mieux que « modérée »
      (CONFIDENCE_ON_FALLBACK), et jamais au-dessus du palier de la ligue.
    """
    # Régime COTE SEULE : confiance BASSE, TOUJOURS. Aucune calibration mesurée →
    # on ne prétend jamais mieux que « faible », indépendamment du championnat.
    if source in ("cote_seule", "cote_derivee"):
        return CONFIDENCE_VALUE["faible"]
    league = LEAGUE_CONFIDENCE.get(league_code, DEFAULT_CONFIDENCE)
    if source == "odds":
        label = "normale"
    elif source in ("repli", "model_marge_excessive"):
        # le minimum (plus prudent) entre le plafond de repli et le palier de la ligue
        order = ("faible", "modérée", "normale")
        label = min(CONFIDENCE_ON_FALLBACK, league, key=order.index)
    else:  # model
        label = league
    return CONFIDENCE_VALUE[label]
