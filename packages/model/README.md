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

> [!IMPORTANT]
> **Réconciliation des noms — étape d'onboarding OBLIGATOIRE.** Les noms
> d'équipes de football-data et de The Odds API diffèrent (« Man Utd » vs
> « Manchester United »). Pour toute nouvelle ligue :
> 1. Ajouter ses variantes à `pipeline/team_aliases.py` (`CURATED_ALIASES`),
>    chaque entrée avec les deux noms en commentaire.
> 2. Faire tourner les **deux tests mécaniques** (`checkmap.py`) :
>    - TEST 1 co-occurrence — deux clubs d'une même saison ne fusionnent jamais ;
>    - TEST 2 volume — aucune entité fusionnée n'a un nombre de matchs anormal.
>
> Une variante **absente** de la carte n'est **jamais** fusionnée : elle reste
> une équipe distincte et apparaît dans le rapport des équipes non réconciliées.
> Pas de repli automatique par jetons (il fusionnait des clubs distincts).

> [!IMPORTANT]
> **Les deux régimes n'ont pas le même risque de fusion — mais aucun n'est sans
> garde-fou.**
>
> | Garde-fou | Régime **modèle** | Régime **cote seule** |
> |---|---|---|
> | Carte curée `CURATED_ALIASES` (appliquée par `canonical_key` à l'ingestion) | actif | **actif** (une seule source de noms, mais `canonical_key` tourne quand même) |
> | TEST 1 co-occurrence football-data (`checkmap`) | actif | **dormant** — pas d'historique football-data à réconcilier |
> | TEST 2 volume football-data (`checkmap`) | actif | **dormant** — même raison |
> | Invariant même-match sur le feed (`assert_distinct_opponents`, `sync.py`) | actif | **actif** — c'est l'équivalent SOURCE UNIQUE du TEST 1 |
>
> Le risque que les deux tests football-data détectent — deux clubs distincts
> fondus par `canonical_key` (jetons de bruit trop agressifs, alias erroné) — **ne
> disparaît pas** en cote seule : `upsert_team` écrit les équipes du feed dans les
> deux régimes. Il **grossit** même dans la longue traîne (Ligue 2, divisions
> basses : plus de clubs d'une même ville séparés par un seul jeton). L'invariant
> même-match le rattrape à l'ingestion (deux adversaires ne partagent jamais une
> clé) ; côté application, `matchTeam` (`resolve.ts`) refuse de deviner un nom de
> ticket ambigu (exact ou mot entier unique, sinon INCONNU).
>
> **Les deux tests football-data se RÉARMENT** le jour où une ligue cote seule est
> **promue** au régime modèle : on lui ajoute alors l'historique football-data, la
> deuxième source de noms réapparaît, et l'onboarding complet (alias + co-occurrence
> + volume) redevient obligatoire pour cette ligue.

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

## Traduction de la cote dans le texte : « une fois sur X » vient de la PROBA, pas de 1/cote

Le rédacteur (app) ajoute une phrase pédagogique sur la sélection la plus risquée :
« Une cote à 7,90, c'est rare : ça passe **environ** une fois sur neuf. »

**Le « une fois sur X » vient de NOTRE probabilité dévigée (`chanceSur`, déjà en base),
JAMAIS de 1/cote.** Pour une cote de 7,90, `1/7,90 ≈ 8`, mais notre probabilité dévigée
donne `≈ 9`. **L'écart est NORMAL, c'est la marge du bookmaker** : `1/cote` inclut la
marge (le prix de vente), le dévigage la retire (l'estimation honnête). Notre chiffre
est le bon.

Deux conséquences à NE PAS « corriger » :
- On ne calcule **jamais** `1/cote` : ce serait faire entrer `coteSaisie` dans un calcul,
  interdit par la règle d'or n°1 (test `no-cote-in-calc`). La cote est **affichée**, pas
  calculée.
- Le mot **« environ »** est **obligatoire** dans la phrase (contrainte du prompt) :
  il dit que notre chiffre est une estimation, pas la division de la cote, et supprime
  le doute quand l'utilisateur compare « 7,90 » à « une fois sur neuf ». Ne pas chercher
  à faire coïncider les deux nombres — c'est la formulation qui s'ajuste, pas le chiffre.

La cote affichée est celle **transcrite de la capture de l'utilisateur** (son ticket).
Si la vision ne l'a pas lue, ou si l'utilisateur a **corrigé** son pari (le marché change,
la cote lue ne correspond plus), la cote est absente → **pas de phrase** (`resolve`/
`corriger` mettent `coteSaisie` à null). Une cote qui ne colle plus au pari serait un
mensonge.

## Bascule cote ↔ modèle sur marge excessive

Le dévigage a été calibré sur Pinnacle. Sur les ligues où Pinnacle est absent
(Grèce, Écosse…), un autre bookmaker sert, parfois à marge très élevée (Grèce :
betclic **18 %**, contre ~5 % pour Pinnacle). À 18 % de marge le book n'est pas
« sharp » : sa cote 1X2 est moins fiable que le modèle calibré. Décision produit :

- Une ligue **bascule vers le modèle** si sa **marge 1X2 moyenne sur 7 j > 10 %**.
- Elle **revient à la cote** seulement si elle repasse **sous 8 %** sur 7 j
  (**hystérésis**, pour ne pas osciller ; jamais de bascule sur un seul relevé).
- Dans ce cas la source est **`model_marge_excessive`** (distincte de `model` =
  marché sans cote) et la **confiance est plafonnée à « modérée »**.
- Chaque bascule est journalisée dans `pipeline_runs.detail.bascules`.

État mémorisé dans `league_source_state` ; logique pure et testée dans
`source_mode.py`. Marge mesurée et journalisée par le collecteur
(`pipeline_runs.detail.marges`).

> [!NOTE]
> La marge de production plus large que celle du backtest est l'**écart n°2**
> ci-dessous, à traiter avec les deux autres à la recalibration.

## Écarts connus backtest ↔ production

Trois écarts séparent les conditions du backtest de celles de la production. Aucun
n'invalide le pipeline aujourd'hui — l'effet sur les probabilités est faible dans
les trois cas — mais **ils se traitent ENSEMBLE le jour de la recalibration.**
Regroupés ici pour ne pas les perdre.

| # | Écart | Backtest | Production | Effet | À faire à la recalibration |
|---|---|---|---|---|---|
| 1 | **Ouverture vs clôture** | cotes de **clôture** | le collecteur relève l'**ouverture** | faible : le dévigage retire la marge des deux côtés | rejouer le backtest sur les cotes d'**ouverture** |
| 2 | **Marge Pinnacle** | ~**2,84 %** (clôture) | ~**5,2 %** (ouverture) | facette de l'écart n°1 : Pinnacle resserre vers le coup d'envoi | vérifié avec le n°1 |
| 3 | **Source du plus/moins 2,5** | cotes 2,5 football-data, **moyennées entre books** | book EU **le plus serré** posant une ligne 2,5 | faible : le meilleur book est proche de la moyenne | mesurer la marge OU-2,5 servie (journalisée) ; escalader seulement si le critère ci-dessous est franchi |

**Pourquoi l'écart n°3 existe.** La ligne principale d'un book flotte selon le
match (2,25 / 2,75 / 3,0…) ; le 2,5 n'est sa ligne principale que ~28 % du temps.
On prend donc le 2,5 chez le book EU le plus serré qui le poste (couverture 100 %,
zéro crédit en plus). Le backtest, lui, utilisait le 2,5 de football-data, déjà
moyenné entre books — donc « meilleur book dispo » est **plus proche** de la
calibration que forcer Pinnacle pur.

**Critère d'escalade `alternate_totals` — chiffré d'avance.** Le marché
`alternate_totals` donnerait le 2,5 de Pinnacle garanti, mais coûte **+50 % de
crédits** sur l'appel cotes. On n'y passe que si le 2,5 gratuit coûte trop en
marge, **largement et durablement** :

> marge OU-2,5 moyenne du book serveur **> 8 %**, sur **plus de 3 ligues**, tenu
> sur **≥ 3 nocturnes** consécutifs.

En deçà, la version gratuite reste préférable. Seuils dans `constants.py`
(`ALT_TOTALS_MARGIN_PCT`, `ALT_TOTALS_MIN_LEAGUES`, `ALT_TOTALS_MIN_NIGHTS`),
surveillés par `health` à partir de `pipeline_runs.detail.totals_2_5_books` (quel
book sert le 2,5 et sa marge, par ligue, journalisé chaque nuit). *Une décision
reportée sans critère est une décision jamais prise* : ce seuil EST la décision.
Chiffres provisoires, à rejuger ici à la recalibration.

## Cotes indévigeables : la cause était l'ÉCHANGE, pas le réassemblage

Un nocturne a planté sur `brentq` (`f(a) et f(b) de même signe`) : un groupe 1X2
dont Σ des probabilités implicites était **< 1** (marge négative), impossible à
déviger. La cause, vue par la donnée (`[cote invalide]` journalise book par book) :

```
soccer_england_efl_cup fixture=43253  WIN_HOME=1.09 DRAW=1.02 WIN_AWAY=1.04
books: betfair_ex_eu, betfair_ex_eu, betfair_ex_eu   → 1/1.09+1/1.02+1/1.04 ≈ 2.9
```

**Le même book (Betfair) sur les trois issues.** Ce sont des cotes d'un **échange
de paris** : un carnet d'ordres quasi vide donne des « cotes » à ~1,05 qui ne sont
pas un prix. Le dévigage est calibré sur des **bookmakers classiques** (marge
positive), pas sur des exchanges au carnet déséquilibré.

**Hypothèse ÉCARTÉE (notée pour le jour où un vrai cas apparaîtra).** On avait
d'abord soupçonné `fetch_latest_odds` de réassembler un groupe en mêlant des books
ou des instants différents (le « dernier par marché » indépendamment). La donnée l'a
réfutée : ici, un seul book, un seul instant. **Ne pas corriger le réassemblage tant
qu'un `[cote invalide]` ne montre pas des books réellement différents sur un même
groupe.** Le garde-fou (rejet + journal de la marge négative) tient dans les deux cas.

**Décision PRISE : exchanges exclus.** La sonde `diag-books` a mesuré 1,5 % des
prédictions issues d'un exchange (un seul, matchbook, ≤ 10 matchs par championnat).
`provider._pick_bookmaker` / `_pick_totals_book` ne retiennent donc plus les
exchanges (`betfair_ex_*`, `matchbook`, `smarkets`, `betdaq`) : mieux vaut aucune
cote (→ repli modèle) qu'un prix de carnet vide. Sur une ligue modèle, un match aux
équipes connues privé d'exchange tombe sur le repli MODÈLE, jamais « non analysé ».
À noter : Pinnacle sert plus de la moitié des prédictions cotées — la référence de
calibration domine.

## Fast-follow post-lancement — cache de rédaction

**À construire APRÈS le paiement, jamais avant le lancement.** Aujourd'hui le
rédacteur (LLM) génère un texte PAR ticket : dix joueurs, même combiné, même jour →
dix générations (~1,5 F chacune). La lecture de capture (≈ 2 F) et les probabilités
(lues en base, coût nul) ne se mutualisent pas ; seul le TEXTE le peut.

Le gain n'existe qu'à l'échelle (gros week-end, mêmes favoris) — d'où le report.
Quand on le fera, la clé de cache est **la combinaison EXACTE**, pas la liste des
matchs :

> `hash( trié[ (fixtureId, marché) ] ) + jour_calcul`

- `(fixtureId, marché)` capture match + marché + **choix** : dans notre modèle le
  choix EST le marché (`WIN_HOME` ≠ `DC_DRAW_AWAY`), donc deux joueurs aux mêmes
  matchs mais paris différents ont des clés différentes — textes différents.
- `+ jour_calcul` est INDISPENSABLE : les probabilités changent chaque nuit (nocturne),
  donc le renforcé ET le texte aussi. Sans le jour, on servirait un texte périmé.

Orthogonal à la facturation (chaque joueur reste facturé selon ses règles) et au
garde-fou n°1 (même combo + même jour → mêmes nombres autorisés).

## Pistes d'amélioration (à évaluer à la recalibration)

**À traiter EN MÊME TEMPS que la recalibration et les trois écarts connus
ci-dessus — jamais avant que le produit tourne de bout en bout.**

### Variables de congestion (calendrier)

Le calendrier ne sert aujourd'hui qu'à **reconnaître** les matchs ; il n'entre
pas dans le calcul. Deux variables de congestion sont calculables depuis notre
**historique existant, sans aucun appel API supplémentaire** :

- **jours de repos** depuis le dernier match, par équipe ;
- **nombre de matchs sur les 14 derniers jours**, par équipe.

**Hypothèse à tester : la congestion améliore-t-elle la prédiction, surtout sur
les MARCHÉS SANS COTE** (double chance, plus/moins 1,5 et 3,5) où le modèle est
notre seule source ? Sur les marchés cotés (1X2, plus/moins 2,5), l'information
est déjà dans la cote — aucun gain à attendre.

**Méthode.** Ajouter les deux variables au modèle, refaire le backtest, comparer
le **log-loss avec et sans, PAR MARCHÉ**. Si le gain est dans le bruit, abandonner
la piste — pas de variable qui ne paie pas sa complexité.

**Bénéfice secondaire à évaluer.** Si l'effet existe, il donne une explication
très concrète à l'utilisateur (« Marseille joue son troisième match en huit
jours ») — plus parlante qu'un chiffre de probabilité. À ne considérer que si le
gain de prédiction est réel : on n'affiche pas une raison qui n'a pas d'effet mesuré.

### Débloquer BTTS (et plus/moins 1,5 · 3,5) par la COTE

BTTS est aujourd'hui **suspendu** — mais la suspension vise le **modèle**, pas la
**cote**. Voir « BTTS — pourquoi c'est suspendu » : le biais du modèle sur « les deux
équipes marquent » est de ~3 pt **et il n'est PAS constant** (−1,6 pt en Bundesliga,
+7,4 pt en La Liga). Un biais qui varie par ligue ne se corrige pas par une règle
unique.

**Cause identifiée.** Dixon-Coles calcule les buts de chaque équipe **séparément** et
les suppose **indépendants**. Or une équipe qui mène défend, une équipe menée pousse :
la dépendance est réelle. Sur le **1X2** et le **total de buts**, l'approximation passe ;
sur **BTTS**, elle mord (c'est exactement une info de co-occurrence de buts).

**La piste.** Une **cote dévigée n'a pas ce biais** — elle vient du marché, pas d'un
modèle qui suppose l'indépendance. **La suspension ne s'applique donc pas au régime
cote** : on peut rouvrir BTTS *uniquement en régime cote*, en gardant la voie modèle
fermée jusqu'à la recalibration par ligue.

**Le blocage est le COÛT, pas la justesse.** BTTS n'est pas dans l'appel groupé
(`/odds` par ligue) : il faut l'endpoint **par événement**, ~**3 crédits par match**.
C'est précisément le cas d'usage de l'**activation à la demande** déjà décrite (voir
« Marchés additionnels À LA DEMANDE ») : ne payer que pour les matchs **réellement
présents dans un ticket utilisateur**, avec déduplication. À ~1 000 tickets/mois, l'ordre
de grandeur est de **quelques centaines de crédits**, pas un abonnement supérieur.

**Même remarque pour plus/moins 1,5 et 3,5**, aujourd'hui calculés par le **modèle seul**
faute de cote groupée : la cote par événement les débloquerait de la même façon, au même
coût marginal.

**Quand.** Après le lancement, dans **le même lot que l'activation à la demande** — jamais
avant que le produit tourne de bout en bout. La confiance reste **basse** (régime cote,
barre de fragilité conservatrice) et le rédacteur ne prétend aucune précision mesurée.

## Seuil de fragilité (étape 4.5)

Une sélection est **fragile** si sa probabilité passe sous le seuil de **son
marché**. Testé sur 60 000 tickets synthétiques de 6-12 sélections.

- **Définition retenue : probabilité seule.** Le désaccord modèle/marché et le
  mouvement de cote ont été testés puis **écartés** : ils baissent la précision
  (4.1/4.2), et le mouvement n'existe pas encore au calcul nocturne.
- **Point de fonctionnement = décision produit : 30 % de sélections marquées.**
  Les courbes précision/rappel (`fragile.py`, `_pr_curves`) montrent un elbow à
  ~30 % sur les marchés « cote » : on marque **peu et juste** (1X2 précision 60 %
  vs 56 % si on marque 60 %). En dessous (20 %), +2 pt de précision coûtent
  −12 pt de rappel.
- **Seuil PAR MARCHÉ** (30ᵉ centile de la proba affichée) : `WIN_*` 0,44 · double
  chance 0,74 · plus de 1,5 → 0,72 · plus de 2,5 → 0,48 · plus de 3,5 → 0,24 ·
  moins de 2,5 → 0,42.
- **Deux régimes de précision.** Sur les marchés « cote » (1X2, plus/moins 2,5) la
  précision **répond** au seuil (~50-60 %). Sur les marchés « modèle sûr » (double
  chance, plus de 1,5) elle est **plate ~28 %** : le modèle ne sait pas classer
  les échecs. → **Badge « fragile » visible seulement là où la précision dépasse
  ~50 %** (`FRAGILE_BADGE_VISIBLE`). Sur les autres, la sélection sert au
  classement interne du retrait ; si on la retire, on l'explique par une **mention
  neutre** (« la moins solide de ton ticket ») — on retire sans crier au loup,
  **jamais en silence**.
- **Honnêteté du signal (1X2, point 30 %)** : précision **60 %** pour un taux
  d'échec de base **45,7 %** → réel mais **modéré** (~14 pt au-dessus du hasard).
  Chiffres figés dans `constants.py` (`FRAGILE_1X2_PRECISION`,
  `FRAGILE_1X2_BASE_FAILURE`) pour qu'ils restent sous les yeux.
- **Ordre de grandeur produit** (dépend du type de ticket) :
  - 9 **favoris 1X2 purs** : brut médiane **0,22 %** → renforcé ~14 % (pire cas,
    peu joué en vrai).
  - 9 **mixte réaliste** (3 double chance + 3 plus/moins + 3 en 1X2) : brut
    médiane **1,41 %** → renforcé **~7,8 %** (retrait au point 30 %). C'est ce
    profil, proche des utilisateurs réels, que doivent refléter les maquettes.

> [!WARNING]
> **Dette avant lancement — chiffres des maquettes.** Les maquettes affichent
> 1,3 % → 7,5 %. Mesuré sur un ticket **mixte** réaliste : **1,41 % → 7,8 %** →
> les maquettes sont **cohérentes**, à condition que leurs exemples représentent
> un ticket mixte (et non un combiné de favoris 1X2 purs, qui donnerait 0,22 %).
> Le « après » remonte quand le retrait est plus agressif. À vérifier maquette
> par maquette avant le lancement : chaque exemple doit être un ordre de grandeur
> réel et étiqueté comme tel.

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

## Pipeline de production (`mtj_model.pipeline`)

Le code qui a produit les courbes de calibration **est** le code qui tourne en
production — pas de réimplémentation TypeScript de Dixon-Coles, qui finirait par
diverger et invaliderait le backtest.

```
Python offline  → entraînement, calibration, backtest
Python nocturne → calcule les probabilités, ÉCRIT dans Postgres  (nightly)
Python 6 h      → collecteur de cotes, historise les mouvements   (collector)
TypeScript      → l'application, qui ne fait que LIRE predictions
```

L'application ne parle jamais à Python. Elle lit Postgres. **Aucune écriture dans
`predictions` depuis l'app, jamais** (règle d'archi n°1 et 2).

**Deux jobs DISTINCTS, jamais fusionnés** — les cotes bougent toute la journée,
les probabilités se figent une fois par nuit :

| Job | Cadence | Écrit | Commande |
|---|---|---|---|
| `verify` | avant de payer | — (lit /sports) | `python -m mtj_model.pipeline.verify` |
| `backfill` | une fois (amorçage) | `fixtures` (terminés) | `python -m mtj_model.pipeline.backfill` |
| `collector` | toutes les 6 h | `odds_snapshots` | `python -m mtj_model.pipeline.collector` |
| `nightly` | 1×/jour (~4 h) | `predictions` | `python -m mtj_model.pipeline.nightly` |
| `health` | surveillance | — (lit `pipeline_runs`) | `python -m mtj_model.pipeline.health` |

Base cible : une seule variable, `MTJ_DATABASE_URL` (chaîne Postgres du pooler
Supabase). Migrations : `0005_predictions_pipeline.sql` + `0006_league_catalog.sql`.

### Règle des UPSERTS — un `ON CONFLICT` doit RÉ-ÉCRIRE toute colonne dérivée du fournisseur

**Un `INSERT … ON CONFLICT DO UPDATE SET` qui omet une colonne la GÈLE à sa valeur
du premier insert — à vie.** Chaque relevé suivant la laisse intacte, même si le
fournisseur l'a corrigée. Le défaut est invisible : la ligne existe, elle a l'air
fraîche, mais une de ses colonnes date du tout premier appel.

C'est exactement le bug « le PSG affiché perdant » : `upsert_fixture` mettait à jour
statut/score/date mais **pas** `team_home_id`/`team_away_id`. The Odds API renvoie
parfois l'orientation domicile/extérieur inversée au premier relevé puis se corrige ;
les cotes (re-collectées) suivaient, le fixture non. Résultat : `score_home`
n'appartenait plus à `team_home_id`, et un match sur cinq sortait faux. Le même trou
existait dans `backfill._batch_fixtures`. Les deux sont corrigés (l'orientation est
maintenant dans le `SET`), et un test verrouille le `DO UPDATE SET`.

**La règle, générale — même esprit que l'isolation d'erreur des boucles par ligue :**

> Le `DO UPDATE SET` (ou le payload d'un `.upsert()` Supabase) doit contenir **toute
> colonne que le fournisseur peut CORRIGER d'un relevé à l'autre**. Une colonne
> dérivée d'une source externe et absente du `SET` est un gel silencieux : la
> première valeur devient la valeur éternelle, et diverge sans bruit des données
> fraîches. **L'exception, à COMMENTER explicitement, ce sont les colonnes locales ou
> historiques qu'on préserve VOLONTAIREMENT** — `league_source_state.bascule_le` (la
> date d'une bascule passée ne se réécrit pas), `league_catalog.regime` (un
> championnat onboardé au modèle ne redevient pas « cote seule » à un re-sync). Tout
> le reste doit suivre la source.

Audit des upserts au moment du correctif (à refaire si on en ajoute) :

| Upsert | Clé | Met à jour | Verdict |
|---|---|---|---|
| `sync.upsert_fixture` (fixtures) | provider_ref | orientation + statut + score + date | **corrigé** (orientation ajoutée) |
| `backfill._batch_fixtures` (fixtures) | provider_ref | orientation + statut + score + date | **corrigé** (orientation ajoutée) |
| `predictions_io.write_predictions` | fixture,marché,jour | proba, confiance, source, seuil, book, calcule_le | complet |
| `collector._write_snapshot` (odds_snapshots) | fixture,marché,book,fenêtre | cote, relevé_le | complet |
| `nightly` (league_source_state) | fd_code | mode, marge, maj_le (bascule_le préservé) | complet, exception commentée |
| `catalogue_sync` (league_catalog) | fd_code | odds_api_key, nom (regime/relevés préservés) | complet, exception commentée |
| `catalogue_sync` (leagues) | provider_ref | actif | ok (nom/pays = cosmétique) |
| `ondemand.upsertFixture` (TS, fixtures) | provider_ref | orientation + date (statut RETIRÉ du payload) | **corrigé** — `statut` forcé à `scheduled` re-terminait un match joué (gel à l'envers) ; retiré → défaut à l'insert, préservé sur conflit |
| `ondemand.ecrirePredictions` (TS) | fixture,marché,jour | proba, source, confiance, seuil | ok (calcule_le non rafraîchi, cosmétique) |

## Fournisseur : The Odds API

Orienté cotes, **Pinnacle disponible en région `eu`** (notre référence de
dé-vigeage). Couvre nos 11 championnats, dont les trois à risque (Écosse,
Belgique, Grèce). Gratuit 500 crédits/mois (sans carte) pour vérifier ; ~30 $/mois
en production (notre volume ≈ 2 600 crédits/mois, 7× de marge).

**Deux référentiels de championnat, une table de correspondance** (exigé) :
`leagues.provider_ref` porte le code football-data (`E0`…, référentiel du MODÈLE :
confiance + ξ) ; `league_catalog` le relie à la clé The Odds API (`soccer_epl`…,
référentiel des COTES). La même correspondance existe en Python
(`constants.ODDS_API_KEYS`) pour que `verify` tourne sans base.

**Mise en route (dans TON environnement — le proxy du bac à sable bloque le
domaine)** :

```bash
# 1. Clé gratuite sur the-odds-api.com (sans carte).
export MTJ_PROVIDER=oddsapi MTJ_PROVIDER_KEY=<clé>

# 2. Vérifier la couverture des 11 ligues AVANT de payer (gratuit, /sports) :
python -m mtj_model.pipeline.verify        # confirme Turquie + les 3 à risque

# 3. Appliquer les migrations, puis lancer le collecteur :
export MTJ_DATABASE_URL='postgresql://…:6543/postgres'
python -m mtj_model.pipeline.collector     # à planifier toutes les 6 h
```

Le collecteur crée au passage les matchs et équipes manquants (rattachement par
nom, idempotent) : il est autosuffisant, pas besoin d'attendre le nocturne.

> [!NOTE]
> Les clés `ODDS_API_KEYS` sont un point de départ ; `verify` les réconcilie avec
> la liste /sports réelle. Une clé fausse (ex. Turquie) se corrige en une ligne
> dans `constants.py` **et** la migration 0006.

**Backfill de l'historique (amorçage, une fois).** Le modèle de production DOIT
s'ajuster sur le MÊME historique que celui qui a produit la calibration (ECE,
seuils, paliers) — sinon la confiance affichée ne correspond plus à ce qu'on
montre. `backfill` charge 3 saisons football-data (officiel prioritaire, miroir en
repli) dans `fixtures`, réconciliées aux équipes du fournisseur de cotes par la
clé normalisée. Idempotent. Il rapporte les matchs par ligue, les équipes NON
réconciliées (la liste, pas le compte), et un échantillon de forces d'équipe.

**Historiser, ne pas écraser.** `predictions` a pour clé `(fixture, marché, jour
de calcul)` : une ligne par jour. On reconstruit exactement ce qu'on annonçait un
jour donné — base de l'historique public. Le temps réel lit la dernière ligne.

**Idempotence.** Rejouer une nuit met à jour les mêmes lignes (UPSERT sur la
clé) — aucun doublon si une nuit échoue puis reprend. Le collecteur : une ligne
par fenêtre de 6 h.

**Surveillance.** Chaque exécution ouvre/ferme une ligne `pipeline_runs` avec le
compte de matchs **par championnat et par source** (cote / modèle / repli), le
**taux de repli par marché coté et par ligue** (`repli_marches`) et **quel book
sert le plus/moins 2,5, avec sa marge** (`totals_2_5_books`). `health` sort en
code ≠ 0 si :
- un job n'a pas réussi depuis > 36 h (nocturne) ou > 12 h (collecteur) ;
- un marché coté retombe au modèle au-delà de **50 %** de repli (panne de
  couverture, pas un choix — `REPLI_ALERT`) ;
- le **critère d'escalade `alternate_totals`** est atteint (voir « Écarts connus »).

Un pipeline mort en silence, c'est une semaine de probabilités périmées servies
aux utilisateurs — et un marché coté qui bascule au modèle sans qu'on le voie,
c'est la moitié de l'avantage perdue en silence.

**Fournisseur de données** encapsulé dans `pipeline/provider.py` (règle d'archi
n°4) : le reste du pipeline ignore d'où viennent calendrier, résultats et cotes.
The Odds API y est branché ; changer de source ne touche que ce fichier. Le
parsing des réponses est isolé en fonctions pures (`parse_odds`, `parse_scores`),
testées sans réseau. `get_provider()` est le seul point de sélection
(`MTJ_PROVIDER` / `MTJ_PROVIDER_KEY`).

> [!NOTE]
> `leagues.provider_ref` porte le **code football-data** (`E0`, `F1`, …) : clé de
> la confiance calibrée (`LEAGUE_CONFIDENCE`) et du ξ. `league_catalog` le relie
> à la clé The Odds API — les deux référentiels ne se confondent jamais.

### Réconciliation des clubs (`club_id`) — OBLIGATOIRE à chaque compétition ajoutée

Les équipes sont enregistrées **par compétition** : « Reims » en Ligue 1 (backfill
football-data) et « Stade de Reims » en Ligue 2 (collecteur Odds API) sont **deux
lignes** du même club. C'est **correct pour Dixon-Coles** (la force se calibre par
championnat, on ne mélange pas L1 et L2), mais ça casse la **résolution du ticket**
si on ne regroupe pas. Le `club_id` regroupe les entités d'un même club **sans
fusionner les lignes** : la compétition reste portée par le match (`fixtures`), le
club par le `club_id`.

**Ajouter une compétition passe donc par cette réconciliation — au même titre que
l'onboarding d'un championnat modèle** (alias + co-occurrence + volume) :

1. `reconcilier-dryrun` (lecture seule) — **rapport à relire avant d'écrire** :
   - SECTION 1 : doublons **intra-championnat modèle** (bug de force d'équipe s'il
     y en a — historique coupé) ; doit être vide.
   - SECTION 2 : regroupements **sains** (club → entités → clé de club).
   - SECTION 2 bis : **faux regroupements ÉVITÉS** par le garde de population (même
     nom, mais clubs différents) — nommés, pour vérifier qu'aucun VRAI club n'y est.
   - SECTION 3 : **co-occurrence bloquante** — deux adversaires ne partagent jamais
     une clé ; les collisions sont dissoutes, jamais fusionnées.
   - SECTION 4 : volume (repère une fusion abusive).
2. `reconcilier` (écrit) — même code de regroupement que le dry-run (il le PRÉDIT),
   **réversible** (`club_reconcile_backup`, migration 0026 → `reconcilier-rollback`
   restaure l'état d'avant) et journalisé, puis **re-teste sur l'état écrit** :
   co-occurrence (lève et annule si violée) + volume. Idempotent.

**Garde de population — la RÈGLE générale (`club_grouping.py`).** Deux entités ne
fusionnent que si **un même club réel pourrait jouer dans les deux compétitions**. Le
garde de co-occurrence est **nécessaire mais pas suffisant** : il répond à « sont-ils
adversaires », pas à « sont-ils le même club » — deux entités qui ne se rencontrent
jamais peuvent être différentes (Bayern **masculin** vs Bayern **féminin** ; **Andorre
sélection** vs **Andorra CF** club ; **Vitória** Brésil vs **Vitória SC** Portugal).
On compare donc une **signature de population** `(genre, sélection ?, pays domestique)`
et deux signatures incompatibles ⇒ clubs différents ; une coupe continentale (sans
pays) reste compatible avec le championnat + les coupes domestiques.

> ⚠️ **Listes de mots-clés À MAINTENIR** (le fournisseur n'expose pas d'attribut
> structuré) : `GENRE_FEMININ`, `MARQUEURS_SELECTION`, `PAYS_CONNUS` dans
> `club_grouping.py`. Un genre féminin **non détecté fusionnerait à tort** (dangereux) ;
> un pays non reconnu = « pas de pays » (au pire un regroupement manqué, bénin). À
> compléter quand le fournisseur ajoute des compétitions.

La clé de club (`sync.club_key`) part de `canonical_key` (**carte curée d'abord** :
`Paris SG` = `Paris Saint Germain`), puis expansion + retrait d'affixes de club. La
résolution (app) cherche le match **par club_id**, quelle que soit l'entité qui le porte.

**LEÇON (garde-fous).** *Un garde-fou qui vérifie UNE condition ne prouve pas l'absence
d'erreur* — le garde de co-occurrence répond à « adversaires ? », pas à « même club ? ».
La **relecture du dry-run avant toute écriture de masse reste OBLIGATOIRE** : c'est elle
qui a attrapé la fusion Bayern H/F que ni la co-occurrence ni le volume n'avaient vue.

> `predictions` et `odds_snapshots` sont indexés par `fixture_id`, jamais par
> `team_id` : la réconciliation `club_id` ne touche donc NI les probabilités NI
> l'historique. Aucun recalcul nocturne nécessaire après réconciliation.

### Migrations & contrat de schéma (`schema_manifest.json`)

**Les migrations s'appliquent À LA MAIN dans Supabase** (éditeur SQL), une par une,
dans l'ordre. Il n'y a **pas** de migration automatique en CI — l'ancienne étape
`migrer-base` avait une liste FIGÉE à 0011 : elle « réussissait » en étant quinze
migrations en retard, sans que personne ne le voie. **Une étape qui migre à moitié
ment.** On ne migre donc plus en CI, on VÉRIFIE.

**Convention (obligatoire) :** quand tu pousses du code qui dépend d'une migration,
dis-le en **PREMIÈRE LIGNE** de la réponse (« ⚠️ dépend de la migration 00NN à
appliquer avant déploiement »). Après l'avoir appliquée, ouvre **`/api/health/schema`**
pour confirmer l'alignement (liste vide = base à jour).

**Trois consommateurs, une source de vérité unique (`packages/db/schema_manifest.json`) :**

| Consommateur | Quand | Ce qu'il fait |
|---|---|---|
| `/api/health/schema` (app) | à la demande, après une migration | objets manquants via `verifier_schema` (0019) |
| `health.py` (cron 6 h → email) | en continu | objets manquants **+ RLS des tables de référence** |
| action CI `verifier-schema` | bouton « Run workflow » | idem, **lecture seule, échoue si décalage** (`verify_schema.py`) |

La **RLS** (section `rls` du manifeste, les 8 tables de référence de la 0016) est
vérifiée côté pipeline en lisant directement `pg_class` : sans elle, la clé publique
lit/écrit `fixtures`, `teams`, `market_map`… et **aucun contrôle « objet présent » ne
le verrait**. Le pipeline se connecte en direct (psycopg) et lit le catalogue ;
l'app, via PostgREST, ne le peut pas — d'où le moteur SQL pour les objets et
l'introspection directe pour la RLS.

**Le manifeste est CURÉ, pas exhaustif** — il liste les objets dont l'absence casse le
produit (3 tables sur ~25), pas tout ce que le code touche. La règle d'architecture n°8
(inscrire au manifeste tout objet lu par le code) reste donc en partie une discipline.
Ce que `tests/test_schema_manifest.py` en **automatise** :

- **Cohérence** — chaque entrée du manifeste cite une migration qui existe et crée
  vraiment l'objet (catch : numéro faux, objet renommé, entrée fantôme).
- **Fonctions** — toute fonction créée par une migration est au manifeste (allowlist
  d'**une** entrée : `verifier_schema`, le moteur lui-même). Une fonction manquante = 500
  garanti dès que le chemin s'exécute ; le test rend l'omission BRUYANTE.

Ce qui **reste humain** : colonnes et tables. « Cet objet est-il lu par le code au point
de faire un 500 ? » est sémantique — un scan SQL ne le sait pas, et un test « tout objet
créé doit être au manifeste » exigerait une allowlist de ~40 objets non-critiques, aussi
fragile que la discipline qu'il remplace. **LEÇON (garde-fous, bis) :** on automatise là
où le garde est net (cohérence, fonctions) ; on ne fabrique pas un faux garde exhaustif
qui recréerait la discipline sous un autre nom.

**LEÇON (garde-fous, ter) — lire le BON témoin.** La migration 0016 est restée
**non-appliquée des mois, invisible** : ses 8 tables de référence étaient lisibles ET
écrivables avec la clé publique. Deux raisons cumulées :
1. Le **mauvais témoin diagnostique**. Compter les policies (`pg_policies`) ne prouve
   RIEN sur l'état RLS : *0 policy = deny-all SI la RLS est active, grand ouvert SINON* —
   les deux rendent zéro ligne. Le seul témoin fiable est **`pg_tables.rowsecurity` /
   `pg_class.relrowsecurity`**, celui que lit `verify_schema.rls_manquantes`.
2. La RLS est l'**unique artefact qu'aucun chemin légitime n'exerce** : le pipeline
   (`postgres`) et l'app (`service_role`) la **bypassent** tous les deux ; seul un
   attaquant en clé anon l'aurait touchée. Tout le reste s'auto-prouve en tournant (une
   contrainte `ON CONFLICT` ou une fonction manquante fait planter un job / une page,
   tout de suite) — la RLS, non. D'où le contrôle dédié qui la lit **sans attendre que
   quelqu'un l'exerce**. Un garde-fou n'est fiable que s'il lit le bon témoin.

#### Résolution du ticket : d'abord l'alias, puis la PAIRE, sinon INCONNU

Côté app (`apps/web/src/lib/server/domain/`), un nom de bookmaker se résout dans
cet ordre :

1. **Exact + alias** (`team-aliases.ts`, `matchTeam`) — rapide, certain, risque nul.
2. **Ressemblance de PAIRE** (`pair-match.ts`, `similarity.ts`) — quand un nom n'est
   PAS résolu, on cherche l'unique fixture dont les DEUX équipes ressemblent aux deux
   noms du ticket. Le contexte du match lève l'ambiguïté qu'un nom seul ne peut pas
   lever (« Séville »/« Sevilla »). Sûr parce que : score = **min** des deux côtés
   (un côté excellent ne rachète pas un côté faible), **un seul candidat franc** requis
   (marge sur le second, sinon INCONNU), et le côté domicile/extérieur est lu sur le
   **fixture**, jamais sur l'ordre du ticket. Le rattrapage ne s'active QUE sur un nom
   non résolu — jamais quand les deux équipes sont connues mais ne jouent pas l'une
   contre l'autre (sinon on fusionnerait « Paris SG » et « Paris FC »).
3. Sinon → INCONNU, avec le meilleur score journalisé (pour aliaser ou confirmer
   l'absence de couverture).

**La carte d'alias ne disparaît jamais — et le cas d'école, c'est Çorum FK.** La
ressemblance de paire est calibrée sur la carte d'alias comme vérité terrain
(`pair-calibration.test.ts`, même méthode que l'ECE du modèle) : à TAU 0,50, **rappel
94,9 %, taux de fausse paire 0,0 %**. Les 5 % qu'elle NE rattrape pas sont exactement
les cas SÉMANTIQUES et de TRANSLITTÉRATION, mesurés :

| Couple | Ressemblance | Verdict |
|---|---|---|
| `seville` / `sevilla` | 0,71 | rattrapée par la paire (orthographe) |
| `corum belediyespor` / `corum fk` | **0,38** | **alias requis** — « belediyespor » (« club municipal ») est un mot différent, aucun caractère commun exploitable |
| `guimaraes` / `vitoria` | **0,00** | **alias requis** — sémantique pur, zéro chevauchement |

C'est la preuve chiffrée que la ressemblance tue le tapis roulant des variantes
d'orthographe, mais que la carte reste indispensable pour l'inguessable. On n'ajoute
plus un alias par faute de frappe ; on en ajoute un quand le nom est un AUTRE mot.

Une mesure d'**observation** tourne en parallèle : sur chaque ligne résolue par le
nom-par-nom, on calcule aussi ce que la paire aurait donné et on journalise les
DÉSACCORDS (`[résolution] DÉSACCORD PAIRE`). C'est le cas dangereux — le nom-par-nom
réussit avec la MAUVAISE équipe — et ces logs décideront, sur données, du passage de
la paire en chemin principal.

### Catalogue de couverture (`pipeline/catalogue.py`)

`python -m mtj_model.pipeline.catalogue` liste **toutes** les compétitions
football du fournisseur via `/v4/sports?all=true` — appel **gratuit, zéro crédit
consommé**, lecture seule. Il distingue actives / hors-saison et chiffre le coût
mensuel de les couvrir toutes, comparé au quota du palier (20 000 crédits/mois).

Sert à trancher l'**univers de couverture** (voir `CLAUDE.md` §« Univers de
couverture ») : la frontière est le catalogue du fournisseur, pas une liste écrite
à la main. On couvre le football **européen** que le fournisseur price ; jamais les
championnats **africains domestiques** (choix produit, pas limite technique).
Modèle de coût vérifié : `crédits/mois = compétitions × relevés/jour × 30 ×
marchés × régions`, soit **240 crédits/mois/compétition** au rythme actuel (4/j,
2 marchés, 1 région). Se lance depuis GitHub Actions
(`Collecte des cotes` → action `catalogue-competitions`).

**Coupes : auto-activées, aucune intervention.** Les coupes que le fournisseur price
(EFL Cup, DFB-Pokal, Coppa Italia, Copa Libertadores/Sudamericana déjà collectées ;
FA Cup, Copa del Rey, Coupe de France, CAN, Coupe du monde + qualifs, Copa América au
catalogue hors-saison) s'activent **toutes seules** dès qu'elles redeviennent actives :
`catalogue_sync` (toutes les 6 h) les insère/réactive en **cote seule** (1 relevé/j),
et le collecteur écrit la prédiction cote-seule dans la foulée. Confiance basse,
« d'après les cotes » — jamais de modèle pour un match de coupe (pas de backtest).

**Super Coupes : hors catalogue, limite acceptée.** Les Super Coupes — matchs uniques
annuels : Trophée des Champions, Community Shield, Supercopa — **ne sont PAS au
catalogue du fournisseur** (vérifié via `catalogue-competitions`). Des affiches (Lens–PSG,
Arsenal–Man City) rencontrées sur des tickets de test **resteront donc non analysées,
non facturées** — « on n'a pas retrouvé ce match ». Ce n'est **pas un bug** : c'est la
donnée qui trace la frontière (règle d'or n°1 — aucun chiffre sans source), pas nous.

### Feuille de route modèle — 11 → 18, APRÈS le lancement

Le lancement se fait avec **toutes** les compétitions du catalogue en **cote
seule** (le ticket d'août passe entièrement, chaque ligne étiquetée). La montée en
valeur, ensuite, c'est **promouvoir** des championnats cote seule vers le régime
**modèle** — là où football-data fournit un historique avec cotes de clôture.

Invisible pour la plomberie : même table `predictions`, `source` passe de
`cote_seule` à `odds`/`model`, la confiance monte. Ce qui change, c'est le
**travail d'onboarding** (jamais compressé — voir le callout ci-dessus) :

Catalogue confirmé (run réel) : **11 modèle actif · 7 éligibles · 27 cote seule ·
22 hors-saison.** Les 7 éligibles : Championship, League One, League Two, **Ligue 2**,
2. Bundesliga, Serie B, La Liga 2.

| Lot | Championnats | Clés The Odds API | Effort |
|---|---|---|---|
| **1 — PRIORITÉ** | **Ligue 2 (France D2)** — très jouée chez nos utilisateurs, et c'est elle qui a fait échouer le ticket test | `soccer_france_ligue_two` | ~½ session — un seul championnat, mais le plus rentable |
| **2** | 3 tiers anglais : Championship, League One, League Two | `soccer_efl_champ`, `soccer_england_league1`, `soccer_england_league2` | ~1 session — même pays, nommage cohérent, alias par lot |
| **3** | 3 D2 continentales : 2. Bundesliga, Serie B, La Liga 2 | `soccer_germany_bundesliga2`, `soccer_italy_serie_b`, `soccer_spain_segunda_division` | ~1 session — plus de diversité d'alias |

Chaque promotion passe par l'onboarding **obligatoire** : carte d'alias curée
(divisions basses = clubs plus obscurs → souvent plus de curation manuelle),
backfill 3 saisons, les deux tests mécaniques (co-occurrence, volume), et un
backtest ECE pour le palier de confiance par championnat. **Deuxième cercle** (Extra
Leagues football-data : Scandinaves, Pologne, Russie…) : format de fichier
différent + cotes réduites → chargeur séparé, qualité moindre, 2ᵉ classe — pas dans
le « 11 → 18 ». Le classement live vs éligible vs cote seule est produit par
`catalogue.py` (`classify()`), confronté au catalogue réel à chaque run.

### Marchés additionnels À LA DEMANDE — validé en principe, à construire après le socle

Les marchés additionnels (plus/moins **1,5** et **3,5**, **BTTS**) vivent sur
l'endpoint **par événement** (coût par match, pas par compétition). Les couvrir
systématiquement sur tout le catalogue exploserait le quota. La solution retenue :
les récupérer **à la demande**, seulement pour les matchs qu'un utilisateur joue
réellement.

**Design (respecte la règle d'archi n°2 — le temps réel LIT, ne calcule pas) :**
déclenché à la **validation du ticket**, un fetch par événement récupère la cote,
la **dé-vige** (calcul déterministe du pipeline) et **écrit dans `predictions`**
(`source=cote_seule`, historisé, idempotent). La page de résultat **lit** ensuite,
comme pour tout le reste. C'est de la **collecte à la demande**, pas un calcul en
temps réel. Grâce à l'historisation `(match, marché, jour)`, un match populaire
n'est payé **qu'une fois** même joué par vingt utilisateurs → ~360 crédits/mois à
1 000 tickets, pas 1 800.

**Deux garde-fous à implémenter avec cette brique :**
1. **Délai court, 2 s max.** Si le fetch dépasse 2 secondes, on n'attend pas : la
   sélection est **non analysée, non facturée**. On ne fait jamais patienter
   l'utilisateur pour une cote.
2. **Crédit journalisé séparément.** L'appel à la demande est compté à part du
   systématique (`pipeline_runs` : `credits_a_la_demande` distinct de `credits`),
   pour voir ce que coûte vraiment l'usage réel, indépendamment de la collecte.

### Second fournisseur : API-Football (api-sports.io) — SECOURS TIÈDE, non intégré

> [!NOTE]
> **Documenté ici, pas branché.** API-Football (api-sports.io) est le **plan B**
> le jour où The Odds API tomberait ou deviendrait trop cher. Il n'a **aucun flux
> actif** : pas de collecteur parallèle, pas de double appel, aucune ligne dans le
> pipeline nocturne. L'encapsulation existante (`pipeline/provider.py`,
> `get_provider()` sélectionné par `MTJ_PROVIDER`) est le point d'accroche : y
> ajouter un `ApiFootballProvider` le jour venu ne touche que ce fichier.
>
> Différences à anticiper avant toute intégration : API-Football est orienté
> **données de match** (calendrier, résultats, compositions) plus que **cotes de
> référence** — Pinnacle n'y est pas la référence de dé-vigeage qu'il est chez The
> Odds API. Le régime « cote seule » y serait donc à revalider. Tant que The Odds
> API tient, on ne l'active pas : un second flux qui tourne « au cas où » brûle du
> quota et double la surface de bug pour zéro bénéfice.

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
