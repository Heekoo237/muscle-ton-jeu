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

Le seuil 0,44 n'était donc pas un détecteur de fragilité : c'était un **détecteur
de favori déguisé**. **Direction 2 — FAIT** : chaque issue a désormais son propre
30ᵉ centile (`FRAGILE_THRESHOLDS`, `constants.py`) :

| Issue | ancien (partagé) | recalibré | marque | gain |
|---|---|---|---|---|
| Victoire domicile | 0,44 | **0,33** | 29 % | +24,0 |
| **Match nul** | 0,44 | **0,22** | 29 % | +6,1 |
| Victoire extérieur | 0,44 | **0,20** | 30 % | +19,6 |
| Double chance 1X | 0,74 | **0,61** | 31 % | +19,9 |
| Double chance X2 | 0,74 | **0,47** | 30 % | +23,2 |
| L'un ou l'autre (12) | 0,74 | **0,73** | 34 % | +2,6 |

Le nul n'est plus marqué à 100 % mais à ~30 % (les plus justes), gain +6,1.

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

### État du badge après Direction 2

Chaque issue marque ~30 % → le badge revient **mérité** partout **sauf « l'un ou
l'autre » (12)**, dont le gain (+2,6) reste sous le plancher de 5 pts. Le nul
badge à nouveau, mais sur les 30 % les plus justes seulement (+6,1), plus le drap
à 100 %. Retrait et badge restent **deux réglages distincts** : on retire toujours
la jambe faible (arithmétique honnête), le badge ne s'affiche que là où le gain le
mérite. Régénérer les deux constantes via `fragile.py:_badge_decision`.

---

## Faits de l'explication — le trou du NUL (à rouvrir après re-mesure)

Sujet **mesuré, mis en attente** après Direction 2. À rouvrir avec les chiffres
post-recalibrage (relancer la requête « part des nuls dans les retraits »).

- **59 % des retraits étaient des nuls** avant recalibrage (n=22, tickets de test
  internes — ordre de grandeur). C'était l'artefact du seuil partagé, pas une
  faiblesse réelle : Direction 2 doit faire retomber ce chiffre.
- **Le nul (et le « 12 ») n'a JAMAIS de fait** : `estDefavorable` (enrich.ts)
  renvoie `false` par construction. Un fait de nos faits est *directionnel*
  (« X en mauvaise forme ») ; un nul n'a pas de direction. D'où l'aveu « c'est la
  cote » sans fait de match.
- **Faits de PARITÉ disponibles** (mesuré, saison 24-25, sur les nuls) : « une
  équipe fait souvent match nul » **45 %** (taux calculable à 83 %) et « match
  serré entre égaux » **28 %**. **Pas le H2H** (« pas de nul depuis N ») : **6 %**
  seulement — il faut un historique multi-saison qu'on n'a pas encore. Un chantier
  parité s'appuierait sur les deux premiers, jamais sur le H2H tant que la donnée
  n'a pas mûri.
- **46 % des analyses sont en régime COTE SEULE** (mesuré : `cote_seule` +
  `cote_derivee`, tickets de test) → **muettes en faits quel que soit le marché**
  (aucun historique lu). Si les joueurs jouent surtout des compétitions non
  modélisées, le chantier parité touche peu de monde — le vrai levier serait
  ailleurs. À trancher sur les chiffres post-Direction 2.

⚠️ **Le seuil COTE SEULE (`FRAGILE_THRESHOLD_COTE_SEULE = 0,50`) n'a PAS été
recalibré** — impossible sans backtest de ces championnats. Il garde donc
l'artefact d'échelle : un nul en cote seule (~0,25) reste sous 0,50, donc retiré.
Sur la re-mesure post-Direction 2, la part de nuls baissera pour le modélisé mais
**pas pour la cote seule** (46 % des lignes). Décision ouverte : donner à la cote
seule des barres fixes conscientes de l'échelle (sans calibration, sans badge), ou
la laisser conservatrice-plate. À trancher séparément.
