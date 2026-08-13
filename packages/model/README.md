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
