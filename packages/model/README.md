# mtj-model — modèle statistique & backtest

Script Python **isolé**. Aucun lien avec l'application web (CLAUDE.md / BRIEF §2‑3).
Tout est déterministe : même entrée, même sortie. Aucun LLM à aucune étape.

## Source des données

> [!IMPORTANT]
> **Le miroir GitHub est un dépannage, lié au blocage réseau de cet
> environnement — PAS une dépendance de production.**
>
> La source de vérité est **football-data.co.uk** (fichiers CSV gratuits :
> résultats + cotes de clôture) ou, à terme, une **API payante** (BRIEF §3.2).
> Dans ce bac à sable, le domaine officiel est bloqué par la politique réseau
> (403 au proxy) ; on récupère alors **les mêmes fichiers gratuits** via un
> miroir GitHub public, uniquement pour pouvoir travailler.
>
> Le miroir n'est pas une dépendance acceptable pour du code de production :
> pas de garantie de disponibilité, de fraîcheur ni d'intégrité. En production,
> la source officielle (ou une API payante) fait foi.

Bascule de source (un seul paramètre, rien d'autre ne change) :

```bash
MTJ_DATA_SOURCE=footballdata  python -m mtj_model.data.load   # source officielle
MTJ_DATA_SOURCE=mirror        python -m mtj_model.data.load   # miroir (défaut ici)
```

## Ajouter un championnat ou une saison

C'est **une ligne de configuration**, jamais du code. Éditer
`config/leagues.toml` :

```toml
[leagues]
E0  = ["Premier League", "Angleterre"]
# … ajouter ici : CODE = ["Nom", "Pays"]

[[seasons]]
code = "2425"
label = "2024-2025"
fd = "2425"        # code officiel football-data
mirror = "data2024" # dossier miroir (dépannage seulement)
```

On démarre sur **11 championnats européens de 1re division**. L'élargissement
aux ligues secondaires et non‑européennes se fera par ajout de lignes — sous
réserve que la source fournisse la ligue **avec cotes de clôture** :

- ✅ Disponibles sur football-data.co.uk (mêmes fichiers, cotes de clôture) :
  1res et 2es divisions d'Angleterre, Écosse, Allemagne, Italie, Espagne,
  France, Pays‑Bas, Belgique, Portugal, Turquie, Grèce.
- ⚠️ **Extra Leagues** football-data (Argentine, Brésil, USA, Mexique, Japon…) :
  format différent (un fichier multi‑saisons par pays) et cotes réduites →
  chargeur distinct à écrire, à traiter comme des modèles séparés.
- ❌ **Absents** de football-data : Saudi Pro League, compétitions de coupe et de
  sélections (Champions League, Euro, CAN). À couvrir, il faudra une autre
  source — et un modèle adapté (Dixon‑Coles est fait pour du championnat).

## Notes pour l'étape 4 (backtest / couverture)

- **Critère de couverture A/B/C = la CALIBRATION, pas le gain sur le naïf.** Un
  championnat déséquilibré est facile à prédire pour le naïf aussi, donc le gain
  y paraît faible sans que le modèle soit mauvais. On classe les championnats sur
  « quand on dit 60 %, ça arrive ~60 % » (courbes de calibration par tranche),
  pas sur l'écart au naïf.

- **Belgique (Jupiler Pro League) — candidat n°1 à l'exclusion, hypothèse à
  confirmer.** La plus dure à prédire (1X2 log-loss 1,040) et le plus faible gain
  (+0,040). Hypothèse : le format **playoffs à points divisés par deux** (top-6
  qui ne s'affrontent qu'entre eux, ~20 % des matchs) casse le modèle standard.
  À l'étape 4 : scinder la calibration **régulière vs playoffs**. Un modèle
  séparé pour les playoffs n'est PAS retenu (≈ 60-70 matchs/saison, échantillon
  trop mince, équipes déjà estimées) ; si seule la phase playoffs déraille, couvrir
  la Belgique en **filtrant** ces journées.

- **Bundesliga — 2ᵉ plus dure, hypothèse.** Le plus de buts (3,18/match) et la
  plus forte variance de buts (3,14) des 11 → score et issues plus bruités. La
  domination du Bayern joue peu (un favori dominant est facile à prédire). À
  confirmer à l'étape 4.

## Architecture hybride de probabilité (décision étape 4)

Le pipeline nocturne ne fait **pas** une seule chose : selon le marché, il lit une
cote ou il calcule le modèle. Tranché par le backtest, pas par préférence.

| Marché | Source | Pourquoi |
|---|---|---|
| 1X2 | **cote d'ouverture dé-vigée** | le marché bat le modèle, fusion `w=0` (4.0) |
| Plus/moins 2,5 | **cote dé-vigée** | idem |
| Double chance | **modèle** | aucune cote de référence, ECE 1,5-2,6 % (4.4) |
| Plus/moins 1,5 & 3,5 | **modèle** | bien calibrés (~3 %) |
| Les deux marquent | **SUSPENDU** | biais non corrigé (voir plus bas) |

Le détail machine est dans `constants.py` (`PROBABILITY_SOURCE`).

> [!IMPORTANT]
> **Repli obligatoire.** Quand la cote d'un marché « cote » est indisponible, le
> **modèle prend le relais** — mais la confiance affichée est **abaissée**
> (`CONFIDENCE_ON_FALLBACK`). On ne présente jamais un repli modèle comme une
> lecture de marché.

## Seuil de fragilité (étape 4.5)

Une sélection est **fragile** si sa probabilité passe sous le seuil de **son
marché**. Testé sur 60 000 tickets synthétiques de 6-12 sélections.

- **Définition retenue : probabilité seule.** Le désaccord modèle/marché et le
  mouvement de cote ont été testés puis **écartés** : ils baissent la précision
  (4.1/4.2), et le mouvement n'existe pas encore au calcul nocturne.
- **Seuil PAR MARCHÉ**, pas unique : les probas sont plus hautes sur les marchés
  sûrs. `WIN_*` 0,55 · double chance 0,80 · plus de 1,5 → 0,79 · plus de 2,5 →
  0,55 · plus de 3,5 → 0,33 · moins de 2,5 → 0,51. Chaque seuil marque ~60 % des
  sélections du marché (même point de fonctionnement que le 1X2 validé).
- **Honnêteté du signal (1X2)** : précision **54 %** pour un taux d'échec de base
  **45,6 %** → réel mais **modéré** (~8 pt au-dessus du hasard). Chiffres figés
  dans `constants.py` (`FRAGILE_1X2_PRECISION`, `FRAGILE_1X2_BASE_FAILURE`) pour
  qu'ils restent sous les yeux et ne soient pas oubliés.
- **Ordre de grandeur produit** : un ticket de 9 favoris 1X2 affiche une proba
  combinée **médiane 0,22 %** ; le même ticket **renforcé** (retrait des <0,55,
  plancher 4) remonte à **~14 %**. C'est ce contraste que portent les maquettes.

## Confiance par championnat (étape 4.3)

Classement par **calibration** (ECE 1X2), pas par gain sur le naïf. **Aucune
exclusion** — un ECE de 5-6 % est imprécis, pas mauvais : on baisse la confiance
affichée (champ PRD), on ne cache pas la ligue.

| Confiance | ECE | Championnats |
|---|---|---|
| **normale** | < 4 % | Premier League, Serie A, La Liga, Belgique* |
| **modérée** | 4-5,5 % | Süper Lig, Ligue 1, Eredivisie, Liga Portugal, Bundesliga, Scottish Prem. |
| **faible** | > 6 % | Super League (Grèce) |

\* Belgique à 4,2 % (limite) ; classée « normale » par décision produit. Table
machine : `LEAGUE_CONFIDENCE` dans `constants.py`.

## BTTS — pourquoi c'est suspendu

Le modèle **sous-estime** « les deux équipes marquent » : prédit 50,9 %, réel
54,1 % (**+3,3 pt**). Deux constats mesurés avant réouverture :

- **Le biais n'est PAS constant.** Il va de **−1,6 pt** (Bundesliga) à **+7,4 pt**
  (La Liga) selon le championnat. Une correction globale unique laisserait donc
  La Liga à +4 et sur-corrigerait la Bundesliga.
- **Ce n'est pas qu'un recalage.** Un biais qui varie par ligue et pointe surtout
  sur les ligues à défenses ouvertes (La Liga, Ligue 1, Turquie) trahit la
  **structure de dépendance** : le Dixon-Coles ne corrige que les scores faibles
  (0-0, 1-0, 0-1, 1-1) via ρ, et sous-estime la co-occurrence de buts ailleurs.
  Une simple correction marginale (Platt/isotonique) alignerait la moyenne mais
  pas la structure. Piste correcte : recalibration **par ligue**, ou un ρ / une
  corrélation buts qui respire selon la ligue. À traiter avant de rouvrir BTTS.

## Commandes

```bash
python -m mtj_model.data.load            # étape 1 : télécharge (cache) + charge en base + résumé
python -m mtj_model.data.load --force    # re-télécharge tout
python -m mtj_model.calibrate            # étape 2 : optimise ξ (récence) par vraisemblance
```

Sortie : base SQLite isolée `data/mtj_stats.db` (git‑ignorée, régénérable).

## Calibration de ξ — périmètre

Les **11 championnats** sont calibrés (aucun n'est écarté pour historique
insuffisant : chacun dispose de 2 saisons complètes avant la saison
d'évaluation). Un seul cas est ignoré, au niveau du MATCH, pas du championnat :
le **tout premier match d'une équipe promue**, tant qu'elle n'a aucun historique
(≈ 17 matchs sur ≈ 3 462, soit 0,5 %). Dès son premier match joué, l'équipe entre
dans l'historique et devient prédictible. Aucun championnat n'est donc exclu.

**Valeur retenue** : demi-vie **365 jours** (ξ ≈ 0,0019/jour), voir
`constants.py`. La courbe log-vraisemblance est plate de 180 à 540 jours ; on se
place au milieu du plateau, pas à son extrémité (l'optimum brut ~500 j est
probablement surestimé, faute de vieux matchs à sous-pondérer avec 3 saisons).

> [!WARNING]
> **ξ est à RECALIBRER quand on ajoutera des saisons.** Avec plus d'historique,
> l'optimum de la demi-vie pourrait raccourcir. Relancer `python -m
> mtj_model.calibrate` et mettre à jour `RECENCY_HALF_LIFE_DAYS` dans
> `constants.py`.
