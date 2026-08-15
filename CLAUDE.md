# Muscle Ton Jeu — Règles du projet

Ce fichier contient les règles permanentes du projet. Elles ne se négocient pas et ne se contournent pas, même temporairement, même « pour tester ».

---

## Documents de référence et hiérarchie d'autorité

| Fichier | Fait autorité sur |
|---|---|
| `CLAUDE.md` | Les règles d'or. **Prime sur tout le reste.** |
| `PRD.md` | Le produit : parcours, écrans, crédits, conformité |
| `BRIEF_TECHNIQUE.md` | L'architecture, les données, l'ordre de construction |
| `DESIGN.md` | Les tokens : couleurs, typographie, espacements, rayons |
| `/design/landing.html` | La composition de la landing page |
| `/design/resultat.html` | La composition de l'écran de résultat |

**En cas de contradiction entre une maquette et le `DESIGN.md`, le `DESIGN.md` gagne.** Les maquettes font autorité sur la composition et la mise en page, jamais sur les valeurs de tokens.

Les écrans sans maquette — dashboard, recharge, validation de lecture, blocage crédits — se construisent directement depuis le `PRD.md` et le `DESIGN.md`.

---

## Ce qu'est le produit

Un outil d'analyse et d'aide à la décision pour parieurs de football en Afrique francophone.

L'utilisateur envoie la capture de son ticket. Le système identifie les sélections fragiles et propose une version renforcée de **son** ticket, obtenue par retrait.

**Ce n'est pas un bookmaker.** Aucune mise, aucun gain versé, aucun lien vers un opérateur.

---

## Règle d'or n°1 — Aucun nombre ne sort d'un LLM

Toute valeur numérique affichée à l'utilisateur provient d'un calcul déterministe. Jamais d'un modèle de langage.

Un LLM à qui l'on demande une probabilité produit un nombre plausible et fabriqué. C'est indétectable après coup. Aucun agent vérificateur ne corrige ce problème — il n'a rien contre quoi vérifier.

**Le LLM a exactement deux droits dans ce projet :**
1. Lire le texte d'une image de ticket
2. Transformer des chiffres déjà calculés en phrases françaises

Il n'a le droit de rien d'autre. Pas de calcul, pas d'estimation, pas de sélection, pas de jugement.

**Contrôle automatique obligatoire** après chaque génération de texte : extraire tous les nombres du texte, vérifier que chacun figure dans le JSON d'entrée, régénérer sinon.

**Exception unique et documentée : la cote transcrite depuis la capture de l'utilisateur.** Elle est affichée pour vérification (l'utilisateur regarde son propre ticket), jamais utilisée dans un calcul. Une cote mal lue est visible et contestable ; une probabilité inventée serait invisible et incontestable — ce n'est pas comparable. **Toute évolution qui ferait entrer `coteSaisie` dans un calcul viole la règle d'or n°1.** Un test (`no-cote-in-calc.test.ts`) échoue si `coteSaisie` apparaît dans un module de calcul.

---

## Règle d'or n°2 — Aucune promesse de gain

Nulle part, sous aucune formulation, même implicite, même dans un commentaire de code, même dans une chaîne de test.

**Vocabulaire interdit dans tout texte affiché :**
garanti · sûr · gagnant · imbattable · secret · méthode · gains · fixed · infaillible

**Le mot « précision » n'apparaît jamais seul.** Un taux de réussite est toujours accompagné du rendement à mise fixe.

---

## Règle d'or n°3 — Le ticket renforcé est construit par retrait

On retire des sélections que l'utilisateur a lui-même choisies. On n'en ajoute jamais, on n'en remplace jamais.

Plancher : jamais moins de 4 sélections dans le ticket renforcé.

Cette règle est juridique autant que produit. Proposer une sélection que l'utilisateur n'a pas choisie transforme l'outil en pronostiqueur.

---

## Règles d'architecture

| # | Règle |
|---|---|
| 1 | Toute probabilité vient de la table `predictions`, remplie par des jobs batch **déterministes** : le nocturne pour le modèle, le collecteur pour la cote seule. Le chemin temps réel **lit**, il ne calcule jamais |
| 2 | Le chemin temps réel ne calcule jamais de probabilité — il lit |
| 3 | Un marché non reconnu est INCONNU. L'état « probable » n'existe pas |
| 4 | Le fournisseur de données sportives est encapsulé dans un seul fichier de service |
| 5 | Le serveur n'envoie jamais au navigateur un contenu non payé. Le floutage CSS est interdit |
| 6 | Deux agrégateurs de paiement sont branchés. Aucun point de défaillance unique |
| 7 | Tout job planifié ET l'application journalisent le **commit** qu'ils exécutent. Un diagnostic sur des données produites par du code inconnu ne vaut rien |

**Pourquoi la règle n°7 — le code testé n'est pas toujours le code exécuté.** On a perdu des heures à diagnostiquer un « bug » du modèle (75 % des matchs sans probabilité) qui n'en était pas un : le nocturne avait tourné à 14 h 04 avec l'**ancienne** fenêtre de 7 jours, et le correctif 21 jours n'a été commité qu'à 15 h 49. Les données regardées venaient d'un code déjà remplacé. Depuis : chaque job imprime `[job] commit <sha>` en première ligne (`pipeline/version.py`, alimenté par `GITHUB_SHA`), et l'application expose son commit sur **`/version`** (`VERCEL_GIT_COMMIT_SHA`). Avant tout diagnostic sur des données, on **vérifie** quel commit les a produites — on ne le suppose jamais. Rappel de terrain : le nocturne n'est PAS planifié (déclenchement manuel) ; ses probabilités ne se rafraîchissent qu'à la relance — le collecteur, la surveillance et le catalogue, eux, tournent toutes les 6 h depuis la branche par défaut.

**Pourquoi deux écrivains (règle n°1).** Le modèle (Dixon-Coles) a besoin d'un ajustement : il ne peut se calculer qu'une fois par nuit, au nocturne. La cote seule, elle, est un simple dévigeage déterministe de la cote — disponible dès que la cote est en base. Faire attendre le nocturne pour l'écrire créait un trou : un match coté à midi restait « pas encore de données » jusqu'à l'aube. Le collecteur l'écrit donc dans la foulée de la collecte. Les deux écrivains passent par **la même fonction** (`predictions_io.cote_seule_rows` → `league_predictions_cote_seule`), alimentée par **la même lecture de cotes** : sur une même entrée, une même valeur — aucune divergence possible. L'invariant est **vérifié**, pas supposé (`test_two_writers.py`). Ce qui ne change pas : le chemin temps réel **lit** toujours, il ne calcule rien ; la source reste `cote_seule`/`cote_derivee`, confiance basse.

---

## Règles de facturation

| # | Règle |
|---|---|
| 1 | Le crédit se débite **à l'affichage réussi du résultat**, jamais avant |
| 2 | Le ticket est sauvegardé **dès la validation de lecture**, avant tout paiement |
| 3 | On ne bloque jamais l'entrée. On bloque uniquement l'affichage du résultat |
| 4 | Après paiement, retour **exactement sur le ticket en cours**, jamais sur l'accueil |
| 5 | Gratuit si : premier ticket, ticket entièrement solide, moins de 3 sélections analysables, même ticket sous 24 h |

**Match déjà commencé.** Un match dont le coup d'envoi est passé est **gardé dans le ticket, jamais analysé, jamais facturé**, et l'utilisateur en est **informé explicitement** (« Ce match a déjà commencé — on ne l'analyse pas »). Une analyse d'avant-match n'a plus de sens une fois le coup d'envoi donné, et laisserait croire qu'on prédit un résultat déjà en cours. On le **dit** — on ne prétend jamais ne pas avoir retrouvé le match. Un ticket mixte (matchs à venir + un commencé) analyse normalement les matchs à venir et signale seulement le commencé.

Paliers : 2-6 sélections = 1 crédit · 7-12 = 2 crédits · 13-20 = 3 crédits · au-delà de 20, blocage.

---

## Marchés couverts

**Couverts :** 1X2 · double chance (1X, X2, 12) · plus/moins de buts (1.5, 2.5, 3.5) · les deux équipes marquent

**Jamais couverts :** corners · cartons · tirs · buteur · mi-temps/fin de match

Un marché non couvert est affiché « non analysé » et n'est jamais facturé. Une probabilité n'est jamais produite pour un marché non couvert.

---

## Univers de couverture — ce que le fournisseur price

**La frontière de couverture, c'est le catalogue du fournisseur de cotes** (The Odds API). La règle est unique et **sans exception géographique : on couvre tout ce que le fournisseur price.** Un championnat absent du catalogue n'est pas couvert ; un match dans un championnat absent est `hors_couverture` — gardé dans le ticket, jamais analysé, jamais facturé, jamais deviné.

Nos utilisateurs sont en Afrique francophone. Ce qu'ils **jouent**, c'est le football **européen** (clubs) et les **grands tournois internationaux, Coupe d'Afrique des Nations comprise** — massivement pariée. Le produit suit ce qu'ils jouent, c'est-à-dire le catalogue.

**Les championnats africains DOMESTIQUES (D1 camerounaise, nigériane…) ne sont pas couverts — parce qu'ils sont ABSENTS du catalogue, pas par décision de notre part.** Aucune source ne les price correctement ; en produire des chiffres violerait la règle d'or n°1. Ce n'est pas une frontière qu'on trace, c'est une frontière que la donnée trace. La CAN, elle, **est** dans le catalogue (hors-saison) : elle est couverte comme toute compétition que le fournisseur price. Il n'y a donc **pas** de règle « pas d'Afrique » — il y a une règle « ce que le fournisseur price », et rien d'autre.

**Deux régimes de probabilité, selon ce qu'on sait du championnat :**

| Régime | Quand | Source | Confiance | Ce que le texte a le droit de dire |
|---|---|---|---|---|
| **Modèle calibré** | Championnats backtestés (les 11 européens de 1re division) | modèle Dixon-Coles + cotes dé-vigées | normale à faible selon l'ECE | peut évoquer une précision **mesurée** |
| **Cote seule** | Tout autre championnat que le fournisseur price mais qu'on n'a pas backtesté | cote dé-vigée uniquement, barre de fragilité **fixe et conservatrice** | **basse, toujours** | « d'après les cotes » — **jamais laisser croire qu'on a mesuré quoi que ce soit** |

En régime **cote seule**, le rédacteur ne prononce jamais un mot qui suggère une calibration, un backtest, une précision vérifiée. La seule honnêteté disponible est : « c'est ce que disent les cotes ». Une probabilité reste un nombre déterministe issu du dé-vigeage (calcul, pas LLM) — la règle d'or n°1 tient dans les deux régimes.

Le second fournisseur (API-Football) est un **secours tiède** : interface prête, jamais un flux parallèle actif. Documenté dans `packages/model/README.md`, pas intégré.

---

## Ton et rédaction

- **Tutoiement partout**
- Phrases de 6 à 12 mots
- Vocabulaire du terrain : ticket, match, cote, sélection, brûler, tomber, mise, combiné
- On dit **ticket**, jamais « coupon »
- Aucun anglicisme marketing : pas d'« insights », « data-driven », « powered by AI »
- Le mot « IA » apparaît au maximum une fois dans l'interface
- Français simple, compréhensible du Cameroun à la Côte d'Ivoire. Pas de slang propre à un seul pays
- Les marchés sont affichés en français, jamais en notation bookmaker
  Correct : « Arsenal ou match nul ». Incorrect : « 1X »

---

## Règle de sobriété chiffrée

Sur les surfaces publiques — landing, historique public, image de partage — les seuls chiffres visibles sont les probabilités du ticket et les prix en francs.

Pas de compteur de sélections, pas de cote totale, pas de numéro de ligne, pas de statistique décorative. Chaque chiffre superflu affaiblit ceux qui portent le message.

Dans le produit connecté, les cotes des sélections restent affichées : l'utilisateur doit pouvoir vérifier qu'on a bien lu son ticket.

---

## Conformité

| # | Règle |
|---|---|
| 1 | Aucun champ de mise, aucun affichage de « gain potentiel » |
| 2 | Le bouton d'action dit « Analyser mon ticket », jamais « Valider » ni « Parier » |
| 3 | Aucun logo ni lien de bookmaker, aucun programme d'affiliation |
| 4 | Mention 18+ visible dans le hero et sous chaque bloc de probabilité |
| 5 | Page « Jeu responsable » accessible depuis toutes les pages |
| 6 | Bouton « J'ai payé, je n'ai rien reçu » relié au support, dès le jour 1 |

---

## Contraintes techniques du marché

- Mobile-first strict : lisible et utilisable à **360 px** de large
- Connexion faible : pas d'image lourde, pas de police externe volumineuse
- Android d'entrée de gamme : éviter les animations coûteuses
- Authentification : **Google OAuth uniquement**. Pas d'email/mot de passe, pas de SMS OTP
- Notifications : **Web Push natif**. Pas de WhatsApp Business API sortant
- Paiement : **Mobile Money**, asynchrone, confirmation possible jusqu'à 40 secondes

---

## Ordre de construction

1. Modèle statistique (Poisson / Dixon-Coles) sur données CSV gratuites
2. **Backtest : calibration + comparaison aux cotes de clôture**
3. Seuil « fragile » calibré + pipeline nocturne + base
4. Vision + résolution + validation + calcul + rédaction
5. Google + crédits + paiement + image de partage
6. Historique public + notifications + dashboard

**L'étape 2 ne doit jamais être compressée.** Sans backtest, le produit affiche des chiffres invérifiés — ce qui contredit son positionnement entier.

---

## En cas de doute

Si une décision d'implémentation n'est pas couverte ici, la trancher dans le sens qui :
1. évite de produire un chiffre non calculé,
2. évite de suggérer un gain,
3. évite de facturer un service non rendu.

Dans cet ordre.
