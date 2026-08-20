# Backtest — l'étape qui peut tout arrêter (CLAUDE.md, brief §2.3)

**Non négociable, jamais compressée.** Avant d'afficher un seul chiffre à un
utilisateur, sur 2 saisons minimum :

1. **Calibration** (`calibration.py`) — regrouper les prédictions par tranche de
   5 % et vérifier que la fréquence observée correspond. Quand le modèle dit
   60 %, l'événement arrive ~60 % du temps.
2. **Comparaison aux cotes de clôture** (`closing_odds.py`) — convertir les cotes
   de clôture en probabilités implicites, retirer la marge, comparer au modèle.
   Le modèle ne doit pas être systématiquement décalé.
3. **Calibration du seuil « fragile »** (`fragile_threshold.py`) — déterminer sur
   données réelles le niveau de probabilité sous lequel une sélection fait
   statistiquement tomber un ticket. Point de départ à tester : 0,55.

Données : `football-data.co.uk` (CSV gratuits, résultats + cotes de clôture).

**Si le modèle n'est pas calibré, on ne construit pas la suite.** Le seuil calibré
remplace la constante `DEFAULT_FRAGILE_THRESHOLD` du moteur TypeScript.

---

## Seuil de fragilité — deux règles apprises à la dure

### Règle 1 — un seuil se calibre sur SON marché, jamais hérité d'un autre

Chaque seuil de retrait doit être le 30ᵉ centile de la proba affichée de **son**
marché. Les marchés à issue unique (plus/moins) le sont. Les deux marchés à
**trois issues** — 1X2 et double chance — ont longtemps **partagé un seul seuil**,
calibré sur une seule issue :

- **Le 1X2 (0,44) a été calibré sur le FAVORI uniquement** (`fragile.py:_selections`
  ne regarde que `argmax(cotes)`), puis appliqué tel quel aux trois issues. Or la
  proba d'un nul plafonne à ~0,31 : elle n'atteint **jamais** 0,44. Mesuré sur
  3 459 matchs (saison 24-25), part marquée sous 0,44 :

  | Issue | proba médiane | q90 | % marqué | base d'échec |
  |---|---|---|---|---|
  | Victoire domicile | 0,43 | 0,73 | 51 % | 56 % |
  | **Match nul** | 0,25 | **0,31** | **100 %** | 75 % |
  | Victoire extérieur | 0,28 | 0,58 | 78 % | 68 % |
  | *Favori (calibré)* | *0,50* | *0,75* | *32 %* | *46 %* |

- **La double chance (0,74)** a le même défaut, moins visible : calé sur le « 12 »
  (marque 43 %), trop haut pour 1X (58 %) et X2 (80 %).

Le seuil 0,44 n'est donc pas un détecteur de fragilité : c'est un **détecteur de
favori déguisé**. La Direction 2 (recalibrage par issue) est mesurée dans le code
et attend son tour.

### Règle 2 — un seuil se valide par son GAIN sur la base, jamais par sa précision absolue

Le badge « trop juste » prétend qu'on a **détecté** un risque. L'ancien critère —
« précision absolue > ~50 % » — était **faux** : sur le nul, la précision est de
75 %, mais c'est le **taux de base** du nul (il tombe 75 % du temps de toute façon).
On marquait 100 % des nuls pour un **gain de +0,0 pt**. Un badge sur 100 % (ou
51 %) des lignes ne se lit plus.

Le bon critère mesure ce que le marquage **ajoute**, et exige qu'il reste **rare** :

> **badge  ⇔  gain sur la base ≥ 5 pts  ET  taux de marquage ≤ 40 %.**

`fragile.py:_badge_decision` est la **source unique** qui régénère
`FRAGILE_BADGE_VISIBLE` (Python) et `BADGE_VISIBLE` (TypeScript) à chaque
recalibrage — copier sa colonne « badge ». Ne **jamais** rallumer un badge à la
main en voyant « le gain est positif » sans regarder le marquage : c'est le
raccourci qui a produit le seuil partagé.

### Intérim en cours (seuils partagés actuels)

| Marché | gain · marquage | badge |
|---|---|---|
| WIN_HOME | +16,0 · 51 % | neutre (marque trop) |
| DRAW | +0,0 · 100 % | neutre (aucune détection) |
| WIN_AWAY | +8,1 · 78 % | neutre (marque trop) |
| DC_HOME_DRAW / DRAW_AWAY / HOME_AWAY | +10,9·58 % / +6,0·80 % / +3,6·43 % | neutre |
| OVER_1_5 / 2_5 / 3_5 | +6,1 / +10,0 / +9,3 · ~30 % | **badge** |
| UNDER_1_5 / 2_5 / 3_5 | +6,7 / +12,2 / +10,4 · ~30 % | **badge** |

Tout le 1X2 et toute la double chance sont en **mention neutre** tant que leur
seuil partagé sur-marque. Ce n'est **pas définitif** : la Direction 2 ramène chaque
issue à ~30 % de marquage, et le badge revient **mérité, tout seul**, dès que le
critère (gain ≥ 5 ET marquage ≤ 40 %) est rempli. Retrait et badge sont **deux
réglages distincts** : on retire toujours la jambe faible (l'arithmétique est
honnête), on arrête seulement de **prétendre l'avoir détectée** là où le gain est nul.
