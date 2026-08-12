# DESIGN.md — Muscle Ton Jeu

**Design system v1.0 · Document de référence pour développeur**
Largeur de conception de référence : **360 px**. Tout le reste est une adaptation.

---

## 1. OVERVIEW

Muscle Ton Jeu n'est pas une application de paris, c'est un **objet imprimé rendu interactif**. Le canvas est un crème chaud, jamais du blanc, jamais du sombre : la surface d'un almanach sportif, d'un carnet de bookmaker, d'un tableau de résultats collé en vitrine. Cette seule décision élimine d'un coup tout le registre casino — un fond crème ne peut pas ressembler à Las Vegas. Elle règle aussi un problème physique : l'utilisateur consulte le produit debout, dehors, en plein soleil, sur un écran d'entrée de gamme dont la luminosité maximale est faible. Le crème renvoie la lumière sans le glare chirurgical du blanc pur, et l'encre chaude reste lisible à 30 000 lux.

La décoration porteuse est la **typographie**, pas l'ornement. Les titres sont posés en grotesque très lourde et condensée, interlignage 1.0, interlettrage négatif : un titre de trois lignes devient un bloc géométrique noir sur crème, une affiche de match sérigraphiée. Il n'y a aucune ombre portée dans le système, aucun dégradé (à une exception atmosphérique près sur le hero), aucune image décorative dans le flux. L'élévation se fait par **contraste de surface** et par **filets de 1 px**. Le rythme de page se fait par **bandes de couleur pleine largeur**. C'est un système qui pèse peu parce qu'il ne contient presque rien : de la couleur plate, des filets, et de la lettre.

La couleur est gouvernée par une seule règle, et c'est la règle la plus importante du document : **l'accent de marque et l'alerte de fragilité appartiennent à deux familles chromatiques séparées**. L'accent brûlant (`--c-accent` `#C93A1A`) est un tampon, pas une notification : il a exactement trois emplois — le bouton d'action principal, le pourcentage du ticket renforcé, le logo. La fragilité parle en ocre (`--c-ocre` `#8C6309`), une hue franchement plus jaune, doublée d'une icône pour ne jamais dépendre de la seule couleur. Une sélection solide, elle, **n'a aucune couleur** : c'est l'état par défaut, il ne se signale pas. Sur l'écran de résultat, seuls deux éléments sont colorés en accent et l'œil sait immédiatement où aller.

**Reconnaissable en une seconde :**

- Crème chaud partout, blanc réservé aux cartes et aux champs.
- Un seul élément accent par écran visible. Jamais deux.
- Titres en blocs typographiques lourds, condensés, tassés.
- Zéro ombre. Des filets de 1 px et des changements de surface.
- Tout ce qui est interactif est en pilule ; le contenu en rayon moyen. Aucun angle vif nulle part.
- Les cotes en monospace, comme sur un ticket imprimé.
- Chiffres tabulaires : les pourcentages s'alignent verticalement, colonne par colonne.
- Les sélections solides sont muettes. Seule la fragilité prend la parole.

---

## 2. COLORS

Toutes les valeurs sont exactes. Les contrastes sont calculés selon WCAG 2.1 (ratio de luminance relative) contre les deux surfaces réellement utilisées : `--c-canvas` et `--c-surface`.

### 2.1 Marque & Accent

| Token | Hex | Rôle | Ne fait JAMAIS |
|---|---|---|---|
| `--c-accent` | `#C93A1A` | Terracotta brûlante. **Trois emplois seulement** : fond du bouton primaire, pourcentage du ticket renforcé, logo. | Jamais sur du corps de texte. Jamais sur un lien. Jamais sur une grande surface hors bande hero. Jamais pour signaler une erreur, une alerte ou une perte. Jamais deux fois dans un même écran visible. |
| `--c-accent-press` | `#A82E12` | État `:active` du bouton primaire uniquement. | Jamais comme couleur de repos. Jamais sur du texte. |
| `--c-accent-line` | `#E8B9A8` | Filet 1 px du module renforcé et du pack mis en avant. C'est un **filet**, pas un remplissage. | Jamais en fond de surface. Jamais sous du texte (contraste insuffisant). |
| `--c-accent-wash` | `#FBEAE3` | Fond de la bande hero et de la ligne de verdict. Une seule occurrence par écran. | Jamais sur une carte de sélection. Jamais empilé avec une autre bande teintée. |

**Contrastes accent :**

| Combinaison | Ratio | Verdict |
|---|---|---|
| `--c-accent` sur `--c-surface` (#FFFFFF) | **5.12 : 1** | AA texte normal · AAA texte large → **surface obligatoire du pourcentage renforcé** |
| `--c-accent` sur `--c-canvas` | **4.56 : 1** | AA texte normal · AAA texte large |
| `--c-surface` sur `--c-accent` (bouton primaire) | **5.12 : 1** | AA texte normal, à partir de 16 px semi-bold |
| `--c-accent` sur `--c-canvas-sunk` | 4.10 : 1 | AA large seulement — **interdit pour `chiffre-xl`**. Le pourcentage renforcé est donc toujours posé sur `--c-surface`. |

### 2.2 Surfaces

| Token | Hex | Rôle | Ne fait JAMAIS |
|---|---|---|---|
| `--c-canvas` | `#F8F1E4` | Crème chaud. Fond par défaut de **tout** le produit, mobile et desktop. | Jamais remplacé par du blanc ni par du sombre, sur aucun écran, y compris les écrans d'attente et d'erreur. |
| `--c-canvas-sunk` | `#EFE5D3` | Crème plus profond. Cartons encastrés, bandes de section alternées, en-têtes de colonne, barre de crédits. | Jamais utilisé comme fond d'une carte censée ressortir. Jamais deux niveaux sunk imbriqués. |
| `--c-surface` | `#FFFFFF` | Blanc. **Uniquement** les cartes individuelles et les champs de saisie. | Jamais en fond de page. Jamais en fond de section. |
| `--c-ink-inverse` | `#F8F1E4` | Texte posé sur `--c-ink` (bouton sombre, pied de page). C'est le crème, pas du blanc. | Jamais du `#FFFFFF` sur fond sombre — le blanc pur casse la chaleur. |
| `--c-line` | `#E2D6C0` | Filet 1 px standard : séparateurs, bordures de carte, contour des champs au repos. | Jamais épaissi au-delà de 1 px. Jamais utilisé comme fond. |
| `--c-line-strong` | `#C9B79A` | Filet 1 px de renforcement : contour du bouton `-outline`, bordure de champ au focus, cadre du module de comparaison. | Jamais pour du texte. |

### 2.3 Texte

Encre chaude, jamais de noir pur. Quatre niveaux descendants.

| Token | Hex | Rôle | / canvas | / surface | Ne fait JAMAIS |
|---|---|---|---|---|---|
| `--c-ink` | `#24201B` | Titres, corps, chiffre de gauche du module, libellés de sélection solide. | **14.4 : 1** | **16.2 : 1** | Jamais utilisé pour signifier une alerte. |
| `--c-ink-2` | `#4A4238` | Corps secondaire, explications, libellés de champ. | **8.8 : 1** | **9.9 : 1** | Jamais pour un titre. |
| `--c-ink-3` | `#6E6357` | Métadonnées, horaires, mentions légales, **texte des sélections retirées** (barré). | **5.2 : 1** | **5.9 : 1** | Jamais en dessous de 14 px. |
| `--c-ink-mute` | `#8A7D6B` | Icônes non porteuses de sens, texte de bouton `-disabled`, placeholders. | 3.58 : 1 | 4.0 : 1 | **Jamais pour du texte porteur d'information à 16 px** — AA large (≥ 24 px) ou composant désactivé uniquement. |

### 2.4 Sémantique de fragilité

Famille chromatique **séparée de la marque**. Vérification explicite : `--c-accent` `#C93A1A` a une hue de **11°** (rouge-orangé) ; `--c-ocre` `#8C6309` a une hue de **42°** (jaune-brun) et une luminance nettement plus basse. Côte à côte, les deux diffèrent à la fois en hue (31°), en saturation et en clarté — le bouton d'action reste le seul point brûlant de l'écran de résultat, et une ligne fragile ne peut pas être confondue avec une action.

| État | Token | Hex | Traitement complet | Ne fait JAMAIS |
|---|---|---|---|---|
| **Solide** | *aucun* | — | `--c-ink`, poids normal, fond `--c-surface`. Aucune couleur, aucune icône, aucun badge. | **Jamais de vert, jamais de coche, jamais de teinte.** L'état par défaut ne se félicite pas. |
| **Fragile** | `--c-ocre` | `#8C6309` | Libellé du marché en `--c-ocre`, filet gauche 3 px `--c-ocre`, fond `--c-ocre-wash`, **icône triangle obligatoire** 16 px, mention « fragile » en `small`. | Jamais utilisé sur un bouton. Jamais sur un titre. Jamais comme couleur de marque. Jamais seul sans icône. |
| | `--c-ocre-wash` | `#F6E9CB` | Fond de la ligne fragile et de la carte fragile. | Jamais en bande pleine largeur. |
| | `--c-ocre-line` | `#D9BC72` | Filet 1 px des blocs fragiles. | Jamais sous du texte. |
| **Retirée / tombée** | `--c-ink-3` | `#6E6357` | `text-decoration: line-through` `1px solid currentColor`, opacité 1 (jamais d'opacité partielle : illisible au soleil), badge `retiré` en `--c-ink-3` sur `--c-canvas-sunk`. | Jamais en rouge. Jamais masqué ni supprimé du flux — la ligne garde sa place pour préserver l'appariement des deux colonnes. |

**Écran de validation de lecture** — trois états de lecture. Ces couleurs vivent sur un écran où `--c-accent` **n'apparaît pas** (le bouton d'action de cet écran est le bouton sombre) : aucune cohabitation rouge/accent n'est donc possible.

| État | Token | Hex | / canvas | Wash | Traitement | Ne fait JAMAIS |
|---|---|---|---|---|---|---|
| Reconnu | `--c-vert` | `#2F6B41` | 5.66 : 1 | `--c-vert-wash` `#E7EFE3` | Filet gauche 3 px, icône coche 16 px. Aucun texte coloré. | Jamais ailleurs que sur l'écran de validation. Jamais pour dire « bon pari ». |
| Ambigu | `--c-ocre` | `#8C6309` | 4.79 : 1 | `--c-ocre-wash` `#F6E9CB` | Filet gauche 3 px, icône triangle, question en `--c-ocre`. | Jamais sans les deux choix affichés. |
| Non reconnu | `--c-rouge` | `#8E241C` | 7.7 : 1 | `--c-rouge-wash` `#F6E2DC` | Filet gauche 3 px, icône croix, libellé « non analysée · non facturée ». | Jamais employé hors validation. Jamais pour un ticket perdant. Sa luminance (7.7) est très éloignée de l'accent (4.56) : les deux ne se confondent pas même si un écran les affichait. |

**Contrastes AAA exigés (chiffres de résultat) :** `chiffre-xl` gauche = `--c-ink` sur `--c-surface` → **16.2 : 1**. `chiffre-xl` droite = `--c-accent` sur `--c-surface` → **5.12 : 1** (AAA large, seuil 4.5). `chiffre-md` = `--c-ink` sur `--c-surface` → 16.2 : 1.

---

## 3. TYPOGRAPHY

Deux couloirs stricts, plus une exception justifiée. Auto-hébergé, `woff2`, sous-ensemble latin, `font-display: swap`.

### 3.1 Familles

| Rôle | Famille | Fichiers | Poids | Substituts |
|---|---|---|---|---|
| **TITRES** | **Anton** (SIL OFL) | 1 fichier, sous-ensemble latin + `À-ÿ` FR | **~21 Ko** | `Oswald 700` → `Archivo Black` → `Haettenschweiler` → `Impact` → `sans-serif` |
| **INTERFACE & CORPS** | **Geist Sans Variable** (SIL OFL), axe `wght 400–700`, `font-feature-settings: "tnum" 1, "ss01" 1` | 1 fichier variable, sous-ensemble latin FR | **~46 Ko** | `Geist Sans 400/600 statiques` → `system-ui` → `Segoe UI` → `sans-serif` |
| **COTES & HEURES** | **JetBrains Mono** (SIL OFL), sous-ensemble `0-9 . , : / – + ( ) %` uniquement | 1 fichier, 1 poids (500) | **~9 Ko** | `ui-monospace` → `SFMono-Regular` → `Menlo` → `monospace` |
| | | **Total** | **~76 Ko** | Budget 120 Ko respecté → **l'exception mono est conservée.** |

**Justification de l'exception mono.** Un ticket de pari est imprimé en monospace : reprendre le mono sur les cotes et les heures est une citation directe de l'objet physique, et cela donne à la colonne de cotes un alignement parfait sans travail supplémentaire. Le sous-ensemble ne contient ni lettres ni accents — 9 Ko — parce que rien d'autre que des chiffres et de la ponctuation n'y est jamais composé. Si un jour un besoin de lettres en mono apparaissait, **l'exception serait abandonnée** plutôt qu'élargie : le budget est un plafond, pas un objectif.

**Anton n'a qu'une graisse.** C'est voulu : il n'existe donc aucun risque de dérive vers une graisse intermédiaire. Geist est variable mais n'expose que **400** (corps) et **600** (interface, boutons, chiffres). 500 et 700 ne sont pas dans le système.

### 3.2 Échelle

| Token | Taille | Famille | Graisse | Interlignage | Interlettrage | Usage |
|---|---|---|---|---|---|---|
| `display` | **44 px** | Anton | 400 (unique) | 1.0 | −1.2 px | Hero de l'accueil, wordmark. **Plafond mobile absolu.** |
| `h1` | 32 px | Anton | 400 | 1.0 | −0.8 px | Titre d'écran (résultat, validation, blocage) |
| `h2` | 24 px | Anton | 400 | 1.05 | −0.5 px | Titres de section, en-têtes de bande |
| `h3` | 18 px | Geist | 600 | 1.25 | −0.2 px | Titres de carte, en-têtes de colonne du module |
| `body-lg` | 18 px | Geist | 400 | 1.45 | 0 | Explication du résultat, chapeau de hero |
| `body` | 16 px | Geist | 400 | 1.5 | 0 | Corps, libellés de sélection, texte de bouton (600) |
| `small` | **14 px** | Geist | 400 | 1.4 | 0 | Métadonnées, mentions légales, badges. **Plancher absolu.** |
| `chiffre-xl` | 52 px | Geist | 600 | 1.0 | −1.5 px | Les deux pourcentages du module. `tnum` + `lnum`. |
| `chiffre-md` | 22 px | Geist | 600 | 1.1 | −0.4 px | Probabilité par ligne, chiffres du bloc bilan. `tnum`. |
| `cote` | 16 px | JetBrains Mono | 500 | 1.2 | 0 | Cotes et heures de match uniquement. `tnum`. |

### 3.3 Principes

1. **Un couloir = un rôle.** Anton ne compose jamais de corps de texte, jamais d'étiquette, jamais de bouton. Geist ne compose jamais de titre au-dessus de `h3`. Mono ne compose jamais autre chose qu'une cote ou une heure.
2. **L'emphase vient du changement de famille ou de la taille.** Jamais d'une graisse intermédiaire ajoutée au corps. Il n'existe pas de « body-bold » dans ce système. Pour insister : passer en `h3` (Geist 600) ou monter d'un cran de taille.
3. **Chiffres tabulaires partout** où un chiffre peut être comparé à un autre : `tnum` est activé globalement sur Geist. Les deux `chiffre-xl` du module ont donc exactement la même avance, quelle que soit la valeur — `1,3 %` et `7,5 %` s'alignent au pixel.
4. **Virgule décimale française** systématique : `7,5 %`, jamais `7.5%`. Espace insécable avant `%`.
5. **Pas de capitales forcées** sur du corps ni sur des boutons. Anton est déjà dense ; les capitales sont réservées au wordmark, aux badges (`small`, `letter-spacing: 0.6px`) et aux en-têtes de colonne du module.
6. **Aucun texte sous 14 px**, y compris les mentions légales et le badge 18+.
7. **`text-wrap: pretty`** sur le corps, **`text-wrap: balance`** sur `h1`/`h2`/`display` pour que les blocs de titre restent des rectangles.
8. **Aucune italique** dans le système : aucune des trois familles n'embarque son italique (économie de poids). L'italique synthétique est interdite.

---

## 4. LAYOUT

### 4.1 Espacement — base 4 px

| Token | Valeur | Emploi typique |
|---|---|---|
| `--s-1` | 4 px | Écart icône/texte, padding interne de badge |
| `--s-2` | 8 px | Écart de lignes dans un groupe serré |
| `--s-3` | 12 px | Padding vertical de ligne, gap de liste dense |
| `--s-4` | 16 px | **Gouttière mobile** : padding horizontal de page, padding de carte |
| `--s-5` | 20 px | Padding de carte confortable |
| `--s-6` | 24 px | Écart entre cartes, padding de bande sur mobile |
| `--s-8` | 32 px | Écart entre blocs d'une même section |
| `--s-10` | 40 px | Écart avant un titre de section |
| `--s-12` | **48 px** | **Padding vertical maximum d'une bande de section sur mobile** |
| `--s-16` | 64 px | Padding de bande desktop |
| `--s-20` | 80 px | Padding de bande hero desktop |

### 4.2 Grille et conteneurs

| Palier | Largeur | Colonnes | Gouttière | Marge | Conteneur max |
|---|---|---|---|---|---|
| **360 (référence)** | 360–479 | 4 | `--s-4` 16 px | `--s-4` 16 px | 328 px utiles |
| 480 | 480–767 | 4 | 16 px | `--s-6` 24 px | 432 px |
| 768 | 768–1023 | 8 | `--s-6` 24 px | `--s-8` 32 px | 704 px |
| 1024 | 1024–1279 | 12 | 24 px | `--s-10` 40 px | 944 px |
| 1280+ | ≥ 1280 | 12 | `--s-8` 32 px | auto | **1120 px** (`--container-max`) |

Les **bandes de couleur sont toujours pleine largeur** (`100vw`) ; seul leur contenu est contraint par `--container-max`. Aucune carte pleine largeur au-delà de 768 px : le contenu de lecture plafonne à **68 caractères** (`--measure`).

### 4.3 Philosophie de l'espace

**Mobile : dense.** L'utilisateur est debout, dehors, il veut voir son ticket entier avec le minimum de scroll. Padding de carte 16 px, hauteur de ligne de sélection 64 px, gap entre cartes 12 px. Une bande de section ne dépasse jamais **48 px** de padding vertical (`--s-12`) — un padding de 80 px sur 360 px de large ne fait qu'ajouter du scroll sans ajouter de hiérarchie.

**Desktop : éditorial.** À partir de 768 px, le système respire et redevient un imprimé : bandes à 64–80 px, titres jusqu'à `display` 72 px (seul point où le plafond mobile est levé), colonnes de texte plafonnées à 68 caractères, grandes zones de crème vide assumées. Le desktop n'ajoute **aucun composant** et **aucune donnée** que le mobile n'a pas ; il ajoute uniquement du blanc tournant et du corps de titre.

**Règle de scroll mobile :** sur l'écran de résultat, le module de comparaison doit commencer à moins de **160 px** du haut du viewport. Rien ne le précède sauf la barre de crédits et le `h1`.

---

## 5. ELEVATION

**Aucune ombre portée dans tout le système.** `box-shadow` n'apparaît que sous une forme : `0 0 0 3px` en anneau de focus. Quatre niveaux, obtenus par contraste de surface et filets de 1 px.

| Niveau | Composition | Emploi |
|---|---|---|
| **E0 — canvas** | `--c-canvas`, aucun filet | Fond de page |
| **E1 — encastré** | `--c-canvas-sunk`, aucun filet | Cartons encastrés, en-têtes de colonne, barre de crédits, bandes alternées. **Recule** visuellement. |
| **E2 — carte** | `--c-surface` + `1px solid --c-line` | Cartes de sélection, cartes de ticket, champs, packs. Niveau par défaut de tout contenu. |
| **E3 — carte accentuée** | `--c-surface` + `1px solid --c-line-strong` + filet supérieur 3 px `--c-accent-line` | Colonne « ticket renforcé », pack mis en avant. Un seul E3 par écran. |
| **E4 — feuille modale** | `--c-surface` + `1px solid --c-line-strong` + rideau `--c-ink` à 55 % d'opacité | Sélecteur de correction, feuille de recharge. Ancrée en bas, jamais centrée. |

**Le focus** : `outline: none` + `box-shadow: 0 0 0 3px --c-line-strong` (`--c-accent` si l'élément est le bouton primaire). Toujours visible, jamais supprimé.

### 5.1 Rythme de bandes de la page d'accueil

Pleine largeur, empilées, séparées par un filet 1 px `--c-line` — jamais par une ombre ni par un espace vide. **Deux couleurs de fond au total** sur la page (`--c-canvas`, `--c-canvas-sunk`) plus l'unique lavis hero.

| # | Bande | Fond | Padding vertical mobile / desktop | Contenu |
|---|---|---|---|---|
| 1 | Barre de crédits | `--c-canvas-sunk` | fixe, 60 px de hauteur | Solde · `btn-primary-sm` |
| 2 | **Hero** | `--c-accent-wash`, **unique dégradé autorisé du produit** : `linear-gradient(180deg, #FBEAE3 0%, #F8F1E4 100%)` | `--s-12` / `--s-20` | `display` 3 lignes, mention légale `small`, `btn-primary` pleine largeur |
| 3 | Analyse du matin | `--c-canvas` | `--s-10` / `--s-16` | Carte E2 du match gratuit |
| 4 | Mes tickets | `--c-canvas-sunk` | `--s-12` / `--s-16` | Liste de cartes ticket E2 |
| 5 | Bilan | `--c-canvas` | `--s-10` / `--s-16` | Trois chiffres, filets verticaux |
| 6 | Pied de page | `--c-ink` | `--s-8` / `--s-12` | Liens `--c-ink-inverse`, badge 18+ |

Deux bandes de même fond ne se suivent jamais. La bande sombre du pied de page est le **seul** aplat sombre du produit : il ferme la page comme le dos d'un almanach.

---

## 6. SHAPES

**Aucun angle vif nulle part**, y compris sur les filets, les bandes de section (les bandes sont pleine largeur, donc sans coin visible) et les avatars.

| Token | Valeur | Emploi |
|---|---|---|
| `--r-pill` | `999px` | **Tout ce qui est interactif** : boutons, champs, sélecteurs, badges, pastilles, pilules de filtre, chips de correction, bouton icône (cercle parfait). |
| `--r-lg` | 20 px | Cartes de contenu principales : colonnes du module de comparaison, feuille modale (coins supérieurs uniquement), carte pack. |
| `--r-md` | 14 px | Cartes secondaires : carte de sélection, carte de ticket, bloc bilan, carton encastré. |
| `--r-sm` | 10 px | Éléments internes d'une carte : vignette de capture, bloc de code de ticket, cellule de tableau détachée. |
| `--r-xs` | 6 px | Micro-éléments : filet gauche 3 px arrondi, case à cocher, curseur de champ. |

**Règles :** un enfant est toujours d'un cran inférieur à son parent (`--r-lg` → `--r-md` → `--r-sm`). Une pilule n'est jamais imbriquée dans une pilule. Le rayon ne change pas selon le breakpoint.

---

## 7. COMPONENTS

Hauteur tactile minimale **48 px** sur tout élément interactif. Transitions : `150ms ease-out`, `opacity` et `transform` **uniquement** — jamais sur `background-color`, `width`, `height` ni `box-shadow`.

### 7.1 Boutons

| Composant | Fond | Texte | Bordure | Rayon | Padding | Hauteur | Typo | Rôle |
|---|---|---|---|---|---|---|---|---|
| `btn-primary` | `--c-accent` | `--c-ink-inverse` | aucune | `--r-pill` | 0 `--s-6` | **52 px** | `body` 600 | L'action unique de l'écran : « Analyser mon ticket », « Recharger ». **Un seul par écran.** |
| `btn-primary-pressed` | `--c-accent-press` | `--c-ink-inverse` | aucune | `--r-pill` | idem | 52 px | idem | `:active` — `transform: scale(0.98)`, 150 ms. |
| `btn-primary-disabled` | `--c-canvas-sunk` | `--c-ink-mute` | `1px solid --c-line` | `--r-pill` | idem | 52 px | idem | Prérequis non remplis. **Jamais l'accent grisé** : un bouton désactivé n'est pas de la marque affaiblie. |
| `btn-primary-sm` | `--c-accent` | `--c-ink-inverse` | aucune | `--r-pill` | 0 `--s-4` | **48 px** | `small` 600 | Uniquement le « Recharger » de la barre de crédits. |
| `btn-dark` | `--c-ink` | `--c-ink-inverse` | aucune | `--r-pill` | 0 `--s-6` | 52 px | `body` 600 | Action de progression neutre : « Analyser 7 matchs sur 9 », « Continuer ». C'est le bouton d'action de tous les écrans où l'accent est déjà pris ou interdit. |
| `btn-outline` | transparent | `--c-ink` | `1px solid --c-line-strong` | `--r-pill` | 0 `--s-6` | 52 px | `body` 600 | Action secondaire : « Corriger une ligne », « Voir l'analyse ». |
| `btn-ghost` | transparent | `--c-ink-2` | aucune | `--r-pill` | 0 `--s-4` | 48 px | `body` 600 | Action tertiaire, liens d'aide : « Problème pour te connecter ? ». Souligné au `:hover`, jamais coloré. |
| `btn-icon` | `--c-surface` | `--c-ink` | `1px solid --c-line` | `--r-pill` (cercle) | — | **48 × 48 px** | icône 20 px | Retour, fermer, informations. Toujours accompagné d'un `aria-label`. |
| `btn-icon-featured` | `--c-canvas-sunk` | `--c-ink` | `1px solid --c-line-strong` | cercle | — | 48 × 48 px | icône 20 px | Bouton icône posé sur une carte blanche, quand `--c-surface` ne contrasterait pas. |

Un bouton pleine largeur (`width: 100%`) sur mobile ; largeur intrinsèque à partir de 768 px. Aucune icône dans `btn-primary` : le libellé suffit.

### 7.2 Barre de crédits — `credits-bar`

Fixe en haut, présente sur **tous** les écrans, y compris blocage et paiement.

| Propriété | Valeur |
|---|---|
| Fond / bordure | `--c-canvas-sunk` · `1px solid --c-line` en bas uniquement |
| Rayon | aucun (pleine largeur) |
| Hauteur | **60 px** mobile et desktop |
| Padding | `0 --s-4` (mobile) · `0 --s-8` (desktop, contenu à `--container-max`) |
| Contenu gauche | `12 crédits` — `chiffre-md` sur le nombre, `body` `--c-ink-2` sur le mot |
| Contenu droit | `btn-primary-sm` — libellé **« Recharger »**, jamais « Acheter des crédits » |
| Variante `-low` | Reste 1 crédit : le nombre passe en `--c-ocre`. Le bouton **reste** `--c-accent`. Aucune animation, aucun clignotement. |
| Variante `-unlimited` | Pack week-end actif : `Illimité · 41 h` en `chiffre-md`, bouton remplacé par un `badge-neutral`. |

**Rôle :** le solde est toujours visible pour qu'aucun blocage ne soit une surprise.

### 7.3 Carte de sélection — `pick-card`

Une ligne de ticket dans le module ou dans le détail d'une analyse.

| Élément | Valeur |
|---|---|
| Fond / bordure / rayon | `--c-surface` · `1px solid --c-line` · `--r-md` |
| Padding | `--s-3 --s-4` |
| Hauteur | **64 px fixe** (2 lignes) — fixe pour préserver l'appariement inter-colonnes |
| Ligne 1 | Match, `body` `--c-ink` |
| Ligne 2 | Marché **en français** (`small` `--c-ink-2`) · cote (`cote`, mono, aligné à droite) |
| Index | Numéro `01`–`20`, `cote` mono `--c-ink-3`, 24 px de large, aligné à gauche |

| Variante | Différences |
|---|---|
| `pick-card-solid` | **Aucune** différence. Pas de couleur, pas d'icône, pas de badge. C'est l'état par défaut. |
| `pick-card-fragile` | Fond `--c-ocre-wash` · bordure `--c-ocre-line` · filet gauche 3 px `--c-ocre` (`--r-xs`) · icône triangle 16 px `--c-ocre` avant le marché · marché en `--c-ocre` · badge `fragile` `small` capitales |
| `pick-card-removed` | Fond `--c-canvas-sunk` · bordure `--c-line` · texte `--c-ink-3` · `line-through` sur le match, le marché **et** la cote · badge `retiré` · **hauteur inchangée** |
| `pick-card-unread` | Marché non couvert : texte `--c-ink-3`, mention « non analysée · non facturée » en `small`, cote absente. Aucune probabilité affichée. |
| `pick-card-fallen` | Historique, après match : identique à `-removed` + libellé « tombé » en `--c-ink`. |

### 7.4 MODULE DE COMPARAISON DE TICKETS — composant signature

Spécification complète en **§ 8**.

### 7.5 Carte ticket (historique) — `ticket-card`

| Propriété | Valeur |
|---|---|
| Fond / bordure / rayon | `--c-surface` · `1px solid --c-line` · `--r-md` |
| Padding | `--s-4` |
| Hauteur | min 96 px, auto |
| Ligne 1 | `Sam. 14 · 9 matchs` — `h3` |
| Ligne 2 | `3 marqués fragiles` — `small` `--c-ink-2` |
| Ligne 3 | statut, voir variantes |
| Cible | toute la carte, `--r-md`, `transform: scale(0.99)` au `:active` |

| Variante | Fond | Ligne 3 | Marqueur |
|---|---|---|---|
| `ticket-card-pending` | `--c-surface` | `En attente · ce soir 20:45` — heure en `cote` mono `--c-ink-3` | `badge-neutral` **En attente** |
| `ticket-card-won` | `--c-surface` | `Ton ticket est passé` — `body` `--c-ink` | Aucun. Pas de vert, pas de coche : le fait suffit. |
| `ticket-card-fallen` | `--c-canvas-sunk` | `Tombé sur Lens – Nice` `--c-ink` + `La version renforcée serait passée` `small` `--c-ocre` | Filet gauche 3 px `--c-ocre` |

### 7.6 Bloc bilan — `tally-block`

Trois chiffres, apparaît à partir de 3 tickets analysés.

| Propriété | Valeur |
|---|---|
| Structure | 3 colonnes égales, séparées par un filet vertical 1 px `--c-line` |
| Fond / rayon | `--c-canvas-sunk` · `--r-md` · padding `--s-6 --s-4` |
| Chiffre | `chiffre-md` (22 px, tabulaire) `--c-ink` |
| Libellé | `small` `--c-ink-2`, 2 lignes max, `tickets analysés` / `matchs marqués fragiles` / `sont effectivement tombés` |
| Mobile 360 | Reste en **3 colonnes** : les chiffres sont courts et la comparaison exige la juxtaposition. Libellés en `small` sur 2–3 lignes. |
| Interdits | Aucun graphique, aucune courbe, aucun pourcentage de progression, **aucun compteur animé**. |

### 7.7 Carte pack de recharge — `pack-card`

| Propriété | Valeur |
|---|---|
| Fond / bordure / rayon | `--c-surface` · `1px solid --c-line` · `--r-lg` |
| Padding | `--s-5` |
| Hauteur | min 112 px |
| Nom | `h3` — `Ticket` / `Journée` / `Week-end` |
| Prix | `chiffre-md` `--c-ink` — `500 F` |
| Contenu | `body` `--c-ink-2` — `5 crédits` · `Illimité 72 h` |
| Mention | `small` `--c-ink-3` — `Les crédits n'expirent jamais` |
| Variante `-featured` | E3 : bordure `--c-line-strong` + filet supérieur 3 px `--c-accent-line` + `badge-accent` **Couvre ton ticket**. C'est le pack qui couvre le ticket en cours. **Le prix ne passe pas en accent** — l'accent de l'écran est déjà pris par le bouton. |
| Variante `-selected` | Fond `--c-canvas-sunk`, bordure `--c-line-strong`, pastille cochée `--c-ink`. |

### 7.8 Écran de blocage crédits — `paywall-screen`

Fond `--c-canvas`. Barre de crédits visible. Une seule action.

| Bloc | Traitement |
|---|---|
| Titre | `h1` — « Ton ticket est prêt. » |
| Sous-titre | `body-lg` `--c-ink-2` — `9 matchs · 2 crédits nécessaires` (chiffres tabulaires) |
| Solde | Carton encastré E1, `--r-md`, padding `--s-4` — « Il te reste **0 crédit**. » nombre en `chiffre-md` `--c-ink` |
| Action | `btn-primary` pleine largeur — « Recharger » |
| Réassurance | `body` `--c-ink-2` — « Ton ticket est gardé. Tu le retrouveras ici. » |
| Absents | Pas de bouton « annuler », pas de « plus tard », pas de croix de fermeture, **aucun aperçu flouté du résultat**. |

### 7.9 Écran de validation de lecture — `read-check-screen`

Se traite au pouce en moins de 15 secondes. `--c-accent` **absent de cet écran** ; l'action est un `btn-dark`.

| Élément | Valeur |
|---|---|
| Ligne | Hauteur **64 px**, fond `--c-surface`, `1px solid --c-line`, `--r-md`, filet gauche 3 px sémantique |
| Ligne verte | filet `--c-vert`, icône coche 16 px, fond `--c-surface`. Aucun texte coloré. |
| Ligne ambre | filet `--c-ocre`, fond `--c-ocre-wash`, icône triangle, **deux chips de choix** (`--r-pill`, 48 px, `btn-outline`) affichées directement dans la ligne, jamais dans une modale |
| Ligne rouge | filet `--c-rouge`, fond `--c-rouge-wash`, icône croix, libellé `small` « non couvert · non facturé », `btn-ghost` « Retirer » |
| Correction | **Aucune saisie clavier.** Tap sur la ligne → feuille E4 ancrée en bas avec liste de chips en pilule. |
| Action finale | `btn-dark` — libellé dynamique **« Analyser 7 matchs sur 9 »**, chiffres tabulaires |
| Compteur | `small` `--c-ink-3` — `2 crédits · les lignes rouges ne sont pas comptées` |

### 7.10 Champs et sélecteurs

| Composant | Fond | Texte | Bordure | Rayon | Hauteur | Typo |
|---|---|---|---|---|---|---|
| `field` | `--c-surface` | `--c-ink` | `1px solid --c-line` | `--r-pill` | **52 px**, padding `0 --s-5` | `body` |
| `field-focus` | `--c-surface` | `--c-ink` | `1px solid --c-line-strong` + anneau `0 0 0 3px --c-line-strong` | `--r-pill` | 52 px | `body` |
| `field-error` | `--c-surface` | `--c-ink` | `1px solid --c-rouge` | `--r-pill` | 52 px | message `small` `--c-rouge` sous le champ |
| `field-disabled` | `--c-canvas-sunk` | `--c-ink-mute` | `1px solid --c-line` | `--r-pill` | 52 px | `body` |
| `chip` | `--c-surface` | `--c-ink` | `1px solid --c-line-strong` | `--r-pill` | 48 px, padding `0 --s-4` | `body` 600 |
| `chip-selected` | `--c-ink` | `--c-ink-inverse` | aucune | `--r-pill` | 48 px | `body` 600 |
| `upload-slot` | `--c-canvas-sunk` | `--c-ink-2` | `1px dashed --c-line-strong` | `--r-lg` | 120 px | `body` — 3 emplacements max |
| `sheet` (E4) | `--c-surface` | — | `1px solid --c-line-strong` | `--r-lg` en haut seulement | auto, max 80 vh | ancrée en bas, poignée 4 × 40 px `--c-line-strong` |

`placeholder` en `--c-ink-mute`. Le libellé est **toujours** au-dessus du champ en `small` `--c-ink-2` — jamais un placeholder seul.

### 7.11 Badge 18+ et mention légale

| Composant | Valeur |
|---|---|
| `badge-age` | Fond `--c-canvas-sunk`, texte `--c-ink`, `1px solid --c-line-strong`, `--r-pill`, hauteur 28 px, padding `0 --s-3`, `small` 600, capitales, `letter-spacing: 0.6px`. Contenu : `18+`. |
| `badge-age-inverse` | Sur le pied de page sombre : fond transparent, texte `--c-ink-inverse`, bordure `1px solid rgba(248,241,228,0.35)`. |
| `legal-note` | `small` (14 px) `--c-ink-3`, `--measure`, `--s-3` au-dessus. Hero : « Outil d'analyse et d'aide à la décision — pas un pronostic garanti · 18+ ». Sous **tout** bloc de probabilité : « Une probabilité n'est pas une garantie. Joue de façon responsable · 18+ ». |
| `badge-neutral` | Fond `--c-canvas-sunk`, texte `--c-ink-3`, `--r-pill`, 28 px, `small`. États factuels : `En attente`, `retiré`, `non analysée`. |
| `badge-accent` | Fond `--c-accent`, texte `--c-ink-inverse`, `--r-pill`, 28 px, `small` 600 capitales. **Consomme l'unique accent de l'écran** : utilisable seulement là où il n'y a pas de `btn-primary` visible (pack mis en avant hors viewport du bouton). |
| `badge-ocre` | Fond `--c-ocre-wash`, texte `--c-ocre`, bordure `--c-ocre-line`, `--r-pill`, 28 px, `small` 600 + icône triangle. `fragile` uniquement. |

La mention légale n'est **jamais** repliée dans un accordéon, jamais en 12 px, jamais en `--c-ink-mute`.

### 7.12 Barre de navigation — `nav-bar`

Il n'y a **pas** de barre d'onglets : le produit est une page unique plus des écrans de flux.

| Contexte | Composition |
|---|---|
| Mobile, dashboard | `credits-bar` seule (60 px, fixe). Rien d'autre. |
| Mobile, écran de flux | `credits-bar` + rangée 56 px : `btn-icon` retour à gauche, titre d'écran `h3` centré tronqué, `btn-icon` aide à droite. Fond `--c-canvas`, filet bas `--c-line`. |
| Desktop ≥ 768 | Une seule barre 72 px : wordmark compact `MTJ` à gauche · `Historique public` · `Jeu responsable` · `Aide` en `btn-ghost` · solde + `btn-primary-sm` à droite. Fond `--c-canvas-sunk`, filet bas `--c-line`. |
| Comportement | La barre ne se cache **jamais** au scroll : le solde doit rester lisible. Pas de flou d'arrière-plan (coût GPU sur entrée de gamme) — un aplat opaque. |

### 7.13 Pied de page — `footer`

| Propriété | Valeur |
|---|---|
| Fond | `--c-ink` — seul aplat sombre du produit |
| Texte | `--c-ink-inverse` (titres, liens) · `rgba(248,241,228,0.72)` (mentions) |
| Padding | `--s-8 --s-4` mobile · `--s-12` desktop |
| Ligne 1 | Wordmark compact `MTJ` en Anton 24 px `--c-ink-inverse` |
| Ligne 2 | Liens `btn-ghost` inversés, empilés sur mobile, en rangée `gap: --s-6` sur desktop : `Historique public` · `Jeu responsable` · `Aide` |
| Ligne 3 | `badge-age-inverse` + `legal-note` inversée : mentions légales, CGU, confidentialité |
| Ligne 4 | `small` — « Muscle Ton Jeu n'accepte aucune mise et ne verse aucun gain. » |
| Interdits | Aucun logo de bookmaker, aucun lien sortant vers un opérateur, aucune icône de réseau social colorée. |

**Liens :** couleur par défaut `--c-ink`, soulignement `1px` `--c-line-strong` à 2 px de décalage ; au `:hover` le soulignement passe en `--c-ink`. Sur fond sombre : `--c-ink-inverse`. **Jamais de lien en accent, jamais de lien bleu.**

---

## 8. LE MODULE DE COMPARAISON — SECTION DÉDIÉE

C'est le composant qui porte tout le produit. Tout le reste du système existe pour que ce module soit lisible.

### 8.1 Structure (desktop, ≥ 768 px)

Deux colonnes de largeur **égale**, `gap: --s-6`.

| Zone | Colonne gauche | Colonne droite |
|---|---|---|
| Élévation | **E2** — `--c-surface`, `1px solid --c-line`, `--r-lg` | **E3** — `--c-surface`, `1px solid --c-line-strong`, filet supérieur 3 px `--c-accent-line`, `--r-lg` |
| En-tête | `--c-canvas-sunk`, hauteur 44 px, `h3` capitales `letter-spacing 0.6px` — **« Ton ticket »** | `--c-canvas-sunk`, 44 px, `h3` capitales — **« Ton ticket renforcé »** |
| Lignes | `pick-card` sans bordure propre, séparées par un filet 1 px `--c-line`, hauteur **64 px fixe** | idem, même ordre, même nombre de lignes |
| Pied de colonne | `--c-surface`, padding `--s-5`, `chiffre-xl` en **`--c-ink`** + libellé `small` « chances que le ticket passe » | `--c-surface`, `chiffre-xl` en **`--c-accent`** + libellé `small` |

**Chaque ligne** : index mono `01`, match en `body` `--c-ink`, marché **écrit en français** (« Arsenal ou match nul », jamais « 1X ») en `small` `--c-ink-2`, cote en `cote` mono alignée à droite, colonne de cote de largeur fixe **56 px**.

**Lignes fragiles** : traitement `pick-card-fragile` — `--c-ocre`, fond `--c-ocre-wash`, icône triangle 16 px. Elles apparaissent en ocre **dans la colonne de gauche**.

**Lignes retirées** : dans la colonne de droite, la ligne **garde sa place**, en `--c-ink-3` barré, badge `retiré`. Elle n'est jamais supprimée du flux : c'est ce qui permet la lecture ligne à ligne des deux colonnes.

### 8.2 Les deux pourcentages

| | Gauche | Droite |
|---|---|---|
| Token typo | `chiffre-xl` 52 px tabulaire | `chiffre-xl` 52 px tabulaire |
| Couleur | **`--c-ink`** `#24201B` | **`--c-accent`** `#C93A1A` |
| Fond | `--c-surface` (contraste 16.2 : 1, AAA) | `--c-surface` (contraste 5.12 : 1, AAA large) |
| Libellé | `small` `--c-ink-3` | `small` `--c-ink-3` |

**Le pourcentage de gauche n'est pas rouge.** C'est un fait, pas une erreur — l'utilisateur a composé ce ticket, on ne le sanctionne pas. Le colorer en alerte reviendrait à lui dire qu'il s'est trompé, alors que le produit lui dit seulement où sont les maillons faibles. Seul le pourcentage de droite porte l'accent de marque, et il est **l'unique élément accent visible** quand ce module est à l'écran : le `btn-primary` de partage se trouve plus bas, hors du viewport du module.

### 8.3 Ligne de résultat

Sous les deux colonnes, pleine largeur du module.

| Propriété | Valeur |
|---|---|
| Fond / bordure / rayon | `--c-accent-wash` · `1px solid --c-accent-line` · `--r-md` |
| Padding | `--s-5 --s-4` |
| Texte | `body-lg` (18 px) `--c-ink`, chiffres en `chiffre-md` tabulaire `--c-ink` |
| Contenu | « **3 matchs retirés. Tes chances passent de 1,3 % à 7,5 %.** » |
| Sous la ligne | `legal-note` — « Une probabilité n'est pas une garantie. Joue de façon responsable · 18+ » |
| Interdits | Aucune animation de compteur, aucune flèche montante, aucun `+477 %`, aucun « gain potentiel ». |

### 8.4 EMPILEMENT À 360 px — le vrai problème de conception

À 360 px, deux colonnes de 164 px sont illisibles : un nom de match ne tient pas. Les colonnes **s'empilent**. Le risque est réel et il faut le nommer : une comparaison empilée n'est plus une comparaison, c'est deux listes successives séparées par 600 px de scroll, et l'utilisateur perd le lien entre les deux. Six dispositifs, tous obligatoires, règlent ce problème.

**1 — La barre de comparaison collante (`compare-sticky`).** Dès que le haut du module franchit le bas de la `credits-bar`, une barre de **48 px** s'ancre sous elle et **reste** jusqu'à la sortie du module. Elle contient les deux pourcentages en permanence, en réduction : `1,3 %` en `chiffre-md` `--c-ink` · flèche `→` `--c-ink-3` · `7,5 %` en `chiffre-md` `--c-accent`. Fond `--c-canvas-sunk`, filet bas `--c-line`. **Conséquence directe : le résultat de la comparaison est visible à 100 % du temps passé dans le module, quel que soit le scroll.** L'empilement ne coûte donc jamais l'accès au chiffre — il ne coûte que la juxtaposition des lignes, réglée par les points suivants.

**2 — L'index d'appariement.** Chaque sélection porte un numéro mono à deux chiffres (`01`–`20`) attribué **une fois pour tout le ticket**, en tête de ligne, dans les deux blocs. Le bloc du bas reprend exactement les mêmes numéros dans le même ordre. Pour comparer, l'utilisateur ne compare pas des positions — il compare des **numéros**. C'est le mécanisme central de lisibilité de l'empilement, et c'est pour ça que le mono existe dans ce système.

**3 — Rien n'est supprimé, rien n'est réordonné.** Le bloc « renforcé » contient **le même nombre de lignes**, dans **le même ordre**, avec **la même hauteur de 64 px** que le bloc « ton ticket ». Les lignes retirées sont barrées, jamais retirées. Le rythme vertical est identique dans les deux blocs : le pouce parcourt la même distance dans les deux.

**4 — En-têtes de bloc collants (`stack-header`).** Chaque bloc a un en-tête de 44 px, `--c-canvas-sunk`, `position: sticky` sous la `compare-sticky`. On sait **toujours** dans quel ticket on se trouve — c'est le premier échec possible d'une comparaison empilée, et il est traité par un seul filet et un aplat.

**5 — Différenciation de surface entre les deux blocs.** Le bloc « Ton ticket » est E2 (bordure `--c-line`). Le bloc « Ton ticket renforcé » est E3 (bordure `--c-line-strong` + filet supérieur 3 px `--c-accent-line`). Un coup d'œil périphérique suffit à distinguer les deux, sans lire l'en-tête.

**6 — La pilule « Voir seulement ce qui change ».** Un `chip` en pilule, posé sous la `compare-sticky`. Actif, il réduit les **deux** blocs aux seules lignes retirées — 3 lignes contre 3 lignes, soit 384 px de haut au total, une comparaison qui tient en un écran. Les lignes solides sont remplacées par une ligne récapitulative unique : `« 6 sélections inchangées »` en `small` `--c-ink-3` sur `--c-canvas-sunk`, tapable pour tout redéployer. C'est l'échappatoire pour un ticket de 15 sélections.

**Ordre vertical à 360 px, de haut en bas :**

| # | Élément | Hauteur |
|---|---|---|
| 1 | `credits-bar` (fixe) | 60 px |
| 2 | `compare-sticky` — les deux % en permanence | 48 px |
| 3 | `chip` « Voir seulement ce qui change » | 48 px + `--s-3` |
| 4 | Bloc **Ton ticket** : en-tête collant + N lignes de 64 px + pied `chiffre-xl` `--c-ink` | 44 + 64 N + 108 px |
| 5 | Bloc **Ton ticket renforcé** : en-tête collant + N lignes + pied `chiffre-xl` `--c-accent` | 44 + 64 N + 108 px |
| 6 | Ligne de résultat + `legal-note` | ~120 px |
| 7 | `btn-primary` « Partager » | 52 px |

**Ce qui est explicitement refusé pour l'empilement :** un carrousel horizontal (on ne peut pas comparer ce qu'on ne voit pas), un onglet « Original / Renforcé » (masque la moitié de la comparaison), un tableau à défilement horizontal (deux axes de scroll sur 360 px), une réduction de la police sous 14 px pour faire tenir deux colonnes.

---

## 9. IMAGE DE PARTAGE

Gabarit **fixe**, rendu serveur (SVG → PNG), aucune image générée, aucune police externe (les trois familles sont embarquées côté serveur). Un seul fichier, ≤ 90 Ko.

**Format 1080 × 1350 px.** Marge de sécurité 72 px sur tous les bords. Fond `--c-canvas` avec une bande supérieure `--c-accent-wash` de 240 px.

| Zone | Y | Contenu | Typo | Couleur |
|---|---|---|---|---|
| Wordmark | 96 | `MUSCLE TON JEU` sur une ligne | Anton 56 px, `ls -1px` | `--c-accent` |
| Étiquettes | 380 | `MON TICKET` / `RENFORCÉ` — deux colonnes de 468 px, `gap 72` | Geist 600, 40 px, capitales, `ls 2px` | `--c-ink-3` |
| **Pourcentages** | 450 | `1,3 %` / `7,5 %` | Geist 600, **260 px**, tabulaire, `lh 1.0`, `ls -8px` | gauche `--c-ink` · droite `--c-accent` |
| Filet | 760 | Filet horizontal 1 px, pleine largeur utile | — | `--c-line-strong` |
| Retraits | 830 | `3 matchs retirés` | Geist 600, 64 px | `--c-ink` |
| Mention | 1140 | `Outil d'analyse — pas un pronostic garanti · 18+` | Geist 400, 32 px | `--c-ink-3` |
| URL | 1220 | `muscletonjeu.com` | Anton 48 px | `--c-ink` |

**Interdits :** aucun nom de match (celui qui reçoit doit venir sur le site), aucune cote, aucun montant, aucun logo de bookmaker, aucun emoji, aucun dégradé, aucune photo.

**Lisibilité en vignette WhatsApp (~180 px de large, soit 1 : 6).** Les pourcentages à 260 px descendent à **43 px** à cette échelle — plus gros que n'importe quel texte de l'interface. Les deux couleurs (encre vs terracotta) restent distinguables à 4.5 : 1 après compression JPEG. Règle de validation : **réduire le gabarit à 180 px de large ; si les deux pourcentages ne sont pas lisibles d'un coup d'œil, le gabarit est rejeté.** Tout ce qui est sous 40 px dans le gabarit disparaît en vignette et est donc, par construction, non essentiel.

---

## 10. LOGO ET IDENTITÉ

Pas d'illustration, pas de mascotte, pas de ballon, pas de silhouette, pas d'écusson. Le logo est **du texte**, construit sur la famille display.

### 10.1 Wordmark complet

`MUSCLE TON JEU` en **Anton**, capitales, trois lignes alignées à gauche, `line-height: 0.92`, `letter-spacing: -1.2px`. Les trois mots forment un bloc rectangulaire volontairement dense — c'est l'objet graphique du produit, l'équivalent d'un titre d'affiche sérigraphiée.

| Variante | Emploi | Couleur |
|---|---|---|
| `logo-accent` | Sur `--c-canvas` / `--c-canvas-sunk` — usage par défaut | `--c-accent` (c'est le 3ᵉ et dernier emploi de l'accent) |
| `logo-ink` | Quand l'accent est déjà consommé par un `btn-primary` dans le même viewport | `--c-ink` |
| `logo-inverse` | Sur `--c-ink` (pied de page) ou sur `--c-accent` (bande hero pleine) | `--c-ink-inverse` `#F8F1E4` — jamais du blanc pur |

**Ligne unique** autorisée uniquement quand la largeur disponible dépasse 640 px (barre desktop, image de partage).

### 10.2 Version compacte

`MTJ` en Anton, une ligne, `letter-spacing: -0.5px`. Avatar et favicon : `MTJ` en `--c-ink-inverse` centré sur un carré `--c-accent` de rayon `--r-md` (32 px de rayon à 128 px de côté). Favicon 32 px : `MTJ` devient illisible → **`M` seul**, `--c-ink-inverse` sur `--c-accent`, carré rayon 6 px.

### 10.3 Règles d'usage

| Règle | Valeur |
|---|---|
| Taille minimale, wordmark 3 lignes | **88 px** de largeur (soit 18 px de corps) |
| Taille minimale, wordmark 1 ligne | 140 px de largeur |
| Taille minimale, compact `MTJ` | 24 px de largeur |
| Zone de protection | **la hauteur de capitale du `M`** sur les quatre côtés. Aucun texte, filet, bordure ni bord d'écran à l'intérieur. |
| Sur crème | `logo-accent`. Contraste 4.56 : 1 — conforme en tant que texte large. |
| Sur accent | `logo-inverse` uniquement (5.12 : 1). Jamais d'encre sur accent. |
| Sur photo | **Interdit.** Le produit ne contient aucune photo. |
| Interdits | Ne pas condenser, étirer, incliner, contourner, ombrer, dégrader, faire pivoter, ni changer l'interlignage. Ne jamais recomposer le wordmark en Geist. Ne jamais ajouter de tagline dans le lockup — la baseline vit dans le hero, en `body-lg`. |

---

## 11. DO'S AND DON'TS

### À faire

1. **Laisser les sélections solides totalement muettes.** Aucune couleur, aucune coche. La couleur est un budget : dépense-la sur la seule ligne qui demande une décision.
2. **Un seul élément accent par écran visible.** Avant d'ajouter de l'accent, vérifier ce qui est déjà accentué dans le viewport et arbitrer.
3. **Écrire tous les marchés en français** : « Arsenal ou match nul », jamais « 1X ». La notation de bookmaker n'apparaît nulle part dans le produit.
4. **Composer les cotes et les heures en mono tabulaire**, colonne de largeur fixe, alignée à droite : la colonne devient une règle graduée.
5. **Garder les lignes retirées dans le flux**, barrées et numérotées, pour que les deux blocs restent appariables ligne à ligne.
6. **Afficher le solde de crédits en permanence**, sur tous les écrans, y compris pendant le paiement : aucun blocage ne doit être une surprise.
7. **Doubler chaque état sémantique d'une forme** : icône triangle pour la fragilité, barré pour le retrait, filet gauche 3 px pour tous. En plein soleil, la hue est le premier signal perdu.
8. **Poser les grands chiffres sur `--c-surface` blanc**, jamais sur crème encastré : c'est la seule surface où le contraste atteint AAA.
9. **Plafonner le display à 44 px sur mobile.** Un titre qui donne quatre caractères par ligne n'est pas un titre.
10. **Annoncer le prix avant l'action** : le nombre de crédits nécessaires est visible pendant la composition, jamais découvert à la fin.

### À ne pas faire

1. **Aucune esthétique casino** : pas de jetons, de cartes, de dés, de roulette, de dorure, de noir laqué, de néon, de lueur, de dégradé violet, de reflet métallique, de bordure lumineuse.
2. **Aucun compteur qui monte.** La probabilité ne s'anime jamais de 0 à 7,5 %. C'est un chiffre, pas une récompense. Aucune barre de progression célébratoire.
3. **Aucun confetti, aucune vibration de succès, aucun son, aucun `scale` supérieur à 1.0** sur l'apparition d'un résultat. Le produit annonce des faits, y compris des faits décevants.
4. **Aucune couleur sur les sélections solides.** Pas de vert, pas de coche, pas de badge « OK ». Colorer le solide détruit la lisibilité du fragile.
5. **Jamais de « gain potentiel »**, jamais de champ de mise, jamais de simulation « si tu mises 1 000 F ». Le produit n'affiche aucun montant lié à un pari.
6. **Aucun motif ethnique décoratif** : ni wax, ni pagne, ni bogolan, ni silhouette de continent, ni couleurs de drapeau national, ni masque. La chaleur vient du crème, de l'accent et de la lettre — jamais du folklore.
7. **Jamais la même hue pour la marque et pour l'alerte.** Toute nouvelle couleur d'alerte doit être vérifiée à ≥ 25° d'écart de hue avec `#C93A1A` et testée côte à côte.
8. **Aucune ombre portée**, aucun `filter: blur`, aucun `backdrop-filter` : ils coûtent des images par seconde sur un Android d'entrée de gamme et n'existent pas dans le vocabulaire imprimé du système.
9. **Aucun angle vif**, y compris sur les vignettes de capture, les cases à cocher et les avatars.
10. **Aucun graphique, aucune courbe, aucun badge de niveau, aucune série de jours, aucun classement entre utilisateurs.** Le classement serait une incitation à jouer plus.
11. **Jamais de texte à 12 px**, y compris les mentions légales, y compris sur desktop.
12. **Aucune image décorative dans le flux principal** — la seule image du produit est la capture envoyée par l'utilisateur, et le gabarit de partage.
13. **Jamais du blanc pur en fond de page**, jamais de mode sombre. Le crème est l'identité ; un thème sombre serait un autre produit.
14. **Jamais de vocabulaire interdit** dans une étiquette, un bouton ou un message : garanti, sûr, gagnant, imbattable, secret, méthode, gains, infaillible, « précision » employé seul.

---

## 12. RESPONSIVE

Points de rupture : **360** (référence) · 480 · 768 · 1024 · 1280.

| Composant | 360 | 768 | 1280 |
|---|---|---|---|
| `credits-bar` | 60 px, pleine largeur, solde + `btn-primary-sm` | 60 px, contenu centré à 704 px | Fusionnée dans la barre desktop 72 px avec les liens |
| `nav-bar` | `credits-bar` seule (dashboard) ou + rangée 56 px (flux) | Idem | Barre unique 72 px, wordmark + liens + solde |
| `display` | 44 px | 56 px | **72 px** (le plafond mobile est levé ici uniquement) |
| Bande hero | padding `--s-12` (48 px), `btn-primary` pleine largeur | `--s-16` | `--s-20`, bouton en largeur intrinsèque, titre sur 2 colonnes |
| **Module de comparaison** | **Empilé** — voir § 8.4 : `compare-sticky` + index d'appariement + en-têtes collants + pilule « ce qui change » | **Deux colonnes**, largeurs égales, `gap --s-6`. `compare-sticky` **supprimée** (les deux % sont déjà visibles ensemble). Pilule « ce qui change » conservée. | Deux colonnes à 1120 px, pieds de colonne alignés sur une ligne de base commune |
| `pick-card` / ligne | 64 px, marché sur 2ᵉ ligne | 64 px, marché sur la même ligne que le match | 72 px, ajout de la probabilité `chiffre-md` par ligne à droite |
| `tally-block` | 3 colonnes, libellés sur 2–3 lignes | 3 colonnes, libellés sur 1 ligne | 3 colonnes, `chiffre-md` porté à 32 px |
| `pack-card` | 3 cartes empilées, `-featured` en premier | Rangée de 3, largeurs égales, `-featured` au centre | Idem, max 960 px |
| `ticket-card` | Pleine largeur, 3 lignes | Pleine largeur, statut aligné à droite | Deux colonnes de cartes |
| `read-check-screen` | Lignes 64 px, chips de choix empilées sous la ligne | Lignes 64 px, chips en ligne à droite | Ligne 72 px, deux colonnes de lignes |
| `sheet` (E4) | Ancrée en bas, 80 vh max | Ancrée en bas | Centrée, 520 px de large, `--r-lg` sur les 4 coins |
| `footer` | Liens empilés | Liens en rangée | Trois colonnes |
| Image de partage | Gabarit fixe 1080 × 1350, **jamais responsive** | — | — |

**Aucun composant n'est ajouté ni retiré** entre 360 et 1280 : seuls la disposition, l'échelle des titres et le padding changent. Une seule exception, structurelle et documentée : la `compare-sticky`, qui n'existe qu'en dessous de 768 px parce que c'est le seul palier où les deux pourcentages ne peuvent pas coexister à l'écran.

---

## 13. ACCESSIBILITÉ ET PERFORMANCE

### 13.1 Contrastes — récapitulatif vérifié

| Paire | Ratio | Exigence | Statut |
|---|---|---|---|
| `--c-ink` / `--c-canvas` | 14.4 : 1 | AA 4.5 | ✅ AAA |
| `--c-ink` / `--c-surface` | 16.2 : 1 | AAA 7.0 sur chiffres | ✅ AAA |
| `--c-ink-2` / `--c-canvas` | 8.8 : 1 | AA 4.5 | ✅ AAA |
| `--c-ink-3` / `--c-canvas` | 5.2 : 1 | AA 4.5 | ✅ AA |
| `--c-ink-mute` / `--c-canvas` | 3.58 : 1 | AA large 3.0 | ✅ large & désactivé uniquement |
| `--c-accent` / `--c-surface` | 5.12 : 1 | AAA large 4.5 sur `chiffre-xl` | ✅ AAA large |
| `--c-ink-inverse` / `--c-accent` | 5.12 : 1 | AA 4.5 | ✅ AA |
| `--c-ocre` / `--c-canvas` | 4.79 : 1 | AA 4.5 | ✅ AA |
| `--c-vert` / `--c-canvas` | 5.66 : 1 | AA 4.5 | ✅ AA |
| `--c-rouge` / `--c-canvas` | 7.7 : 1 | AA 4.5 | ✅ AAA |
| `--c-ink-inverse` / `--c-ink` | 13.7 : 1 | AA 4.5 | ✅ AAA |

**Non-dépendance à la couleur :** fragile = ocre **+ triangle + mot « fragile »** ; retiré = **barré + mot « retiré »** ; vert/ambre/rouge = **filet gauche + icône + libellé**. Testé en simulation deutéranopie et protanopie : ocre et terracotta restent séparés par la clarté (4.79 vs 4.56 sur crème, hues 42° vs 11°), et de toute façon aucune information n'est portée par la seule hue.

### 13.2 Cibles et interactions

- Cible tactile minimale **48 × 48 px** ; boutons d'action à 52 px. Espacement minimal entre deux cibles : `--s-2` (8 px).
- Transitions **150 ms max**, `opacity` et `transform` uniquement. `prefers-reduced-motion: reduce` → transitions à `0ms`.
- Ordre de tabulation = ordre du DOM. Anneau de focus toujours visible (§ 5).
- Zoom navigateur jusqu'à 200 % sans perte de contenu ni scroll horizontal (aucune largeur fixe en px sur les conteneurs).
- Un `aria-label` sur tout `btn-icon`. Les deux pourcentages du module sont dans un `<table>` sémantique avec en-têtes de colonne, `aria-live="polite"` sur la ligne de résultat.

### 13.3 Poids de page cible

| Ressource | Cible |
|---|---|
| HTML de l'écran de résultat | ≤ 14 Ko gzip |
| CSS total du produit | ≤ 12 Ko gzip (aucune librairie UI, aucun framework CSS) |
| **Polices** | **≤ 76 Ko** (Anton 21 + Geist var. 46 + JetBrains Mono sous-ensemble 9) |
| JS | ≤ 40 Ko gzip |
| Images dans le flux | **0 Ko** — aucune image décorative |
| Icônes | SVG inline, 9 icônes, ≤ 3 Ko au total. Aucune police d'icônes. |
| **Total premier écran** | **≤ 150 Ko** · First Contentful Paint ≤ 2,5 s en 3G simulée (400 kbit/s, RTT 400 ms) |

### 13.4 Connexion lente

- Polices en `font-display: swap` avec substituts métriquement proches (`system-ui` pour Geist, `Impact`/`Oswald` pour Anton) : le contenu est lisible avant le chargement des polices, et le décalage de mise en page reste sous 0,1 de CLS.
- Le crème et l'encre sont posés par le CSS critique **inline** : jamais de flash blanc, jamais de flash sombre.
- Aucune requête bloquante hors le CSS critique. Les polices sont `preload` mais non bloquantes.
- Écran d'attente de paiement : texte statique, aucun spinner animé en boucle infinie ; un point qui pulse en opacité (150 ms, `prefers-reduced-motion` respecté) et le message « On vérifie encore. » — jamais le mot « échec ».
- Le résultat consulté est mis en cache local : une analyse déjà payée s'ouvre hors ligne.

### 13.5 Plein soleil

- Le crème `#F8F1E4` (luminance 0.88) réfléchit sans le glare du blanc pur ; l'encre chaude à 14.4 : 1 reste lisible à luminosité d'écran réduite.
- **Aucun texte porteur d'information sous 4.5 : 1.** `--c-ink-mute` est réservé au décoratif et au désactivé, précisément parce qu'il disparaît au soleil.
- Aucune information portée par une teinte pâle : les washes (`--c-ocre-wash`, `--c-vert-wash`, `--c-rouge-wash`) sont **toujours** doublés d'un filet 3 px saturé et d'une icône. Si le wash devient invisible au soleil, le filet et l'icône subsistent.
- Aucune ombre, aucun dégradé, aucun flou : ce sont les premiers éléments à disparaître en lumière directe, et ils ne portent ici aucune information.
- Épaisseur minimale de filet informatif : **3 px** (filets gauches sémantiques). Les filets de 1 px sont purement structurels et leur disparition ne coûte aucune information.

---

## 13 bis. ADDENDUM v1.1 — LE MODULE PAPIER

Le module de comparaison est rendu comme **deux tickets de caisse posés côte à côte**, jamais comme deux cartes d'interface.

| Élément | Valeur |
|---|---|
| Papier | `--c-paper` `#FDFAF3` — plus clair que `--c-canvas`, aucun rayon (un ticket a des bords droits) |
| Bords | Dents de scie en haut et en bas : `radial-gradient(circle at 50% 0, transparent 0 5px, #FDFAF3 5.5px)`, `background-size: 14px 10px`, `repeat-x`. Aucune image. |
| Relief | `filter: drop-shadow(0 3px 5px rgba(36,32,27,0.13))` sur le wrapper — **seule exception** à « aucune ombre » : elle suit la découpe et n'existe que sur le papier |
| Inclinaison | Symétrique obligatoire : ±0,8° desktop, ±0,6° mobile. Asymétrique = les deux totaux ne retombent plus à la même hauteur. |
| Typographie | Tout en `cote` (mono 14 px min). Seul l'en-tête est en display. |
| Séparateurs | `1px dashed --c-line-strong`, jamais de filet plein |
| Total | `TES CHANCES` + pourcentage en bas, mono, à droite : encre à gauche, `--c-accent` à droite |
| Fragile | Un ▲ ocre en fin de ligne, dans une cellule flex qui ne consomme pas la largeur du nom. Aucun fond coloré. |
| Retiré | Nom, marché et cote barrés en `--c-ink-3` |

**Règle d'alignement — la plus importante du module.** Les deux tickets ne s'empilent jamais, y compris à 360 px. Pour que les deux totaux partagent la même ligne de base, chaque ligne de sélection et l'en-tête portent un `min-height` calé sur le **pire cas de retour à la ligne mesuré à la largeur la plus étroite** (80 px par ligne, 104 px pour l'en-tête à 169 px de large). Réserver la hauteur sur la ligne entière, jamais sur le nom de match seul : la réserver sur le nom éloigne le marché de son propre match et casse la proximité.

**Cotes.** Absentes de la landing (elles n'aident pas à repérer le fragile), présentes dans l'écran de résultat du produit (il doit vérifier qu'on a bien lu son ticket).

---

## 14. ITERATION GUIDE

**Les cinq invariants.** Toute évolution qui en casse un n'est pas une extension du système, c'est un autre système.

1. Le fond par défaut est le crème `--c-canvas`. Ni blanc, ni sombre, sur aucun écran.
2. `--c-accent` a trois emplois : bouton primaire, pourcentage renforcé, logo. Un seul élément accent par écran visible.
3. Marque et alerte appartiennent à deux familles chromatiques séparées (≥ 25° d'écart de hue).
4. Aucune ombre portée. L'élévation est un contraste de surface plus un filet de 1 px.
5. Aucun angle vif. Interactif = pilule, contenu = `--r-md` / `--r-lg`.

**Ajouter une couleur.** Par défaut : ne pas en ajouter. Si un nouvel état sémantique apparaît, d'abord chercher à le dire avec la forme (icône, filet, barré, position) plutôt qu'avec la teinte. Si une couleur est vraiment nécessaire : hue à ≥ 25° de `#C93A1A` **et** de `#8C6309`, contraste ≥ 4.5 sur `--c-canvas` et `--c-surface`, un wash associé, un filet 3 px, une icône, et une ligne « ne fait jamais » écrite dans le § 2 avant tout code.

**Ajouter un composant.** Le décrire d'abord à 360 px. Composer avec les niveaux existants (E1–E4) plutôt qu'en inventer un. Aucun nouveau rayon, aucune nouvelle taille de police : si l'échelle ne suffit pas, c'est la hiérarchie du composant qui est fausse. Écrire son rôle en une phrase ; si la phrase contient « et », c'est deux composants.

**Ajouter une police.** Non. Le budget est un plafond de 120 Ko et il est engagé à 76 Ko. Un nouveau besoin typographique se résout dans l'échelle existante ou par un changement de famille entre les trois couloirs. La première extension à sacrifier, en cas de nécessité, est le mono des cotes.

**Ajouter un écran.** Il hérite de la `credits-bar`, du `footer`, de `--c-canvas`, et d'**une seule** action principale. S'il y a deux actions de poids égal, l'une des deux est un `btn-outline` ou l'écran est mal découpé. La mention légale suit tout bloc de probabilité, sans exception.

**Ce qui ne s'ajoute jamais**, quelle que soit la demande : un mode sombre, une animation de célébration, un compteur animé, un graphique, un classement, un affichage de gain potentiel, un lien vers un bookmaker, un motif décoratif.

**Ordre de revue avant toute mise en production d'un écran :**

1. Combien d'éléments accent dans le viewport ? Si > 1 → refus.
2. Les sélections solides sont-elles totalement incolores ? Si non → refus.
3. Tout texte est-il ≥ 14 px et ≥ 4.5 : 1 ? Si non → refus.
4. Toute cible est-elle ≥ 48 px ? Si non → refus.
5. Une ombre, un dégradé, un angle vif ? Si oui → refus.
6. À 360 px, le module de comparaison reste-t-il appariable ligne à ligne ? Si non → refus.
