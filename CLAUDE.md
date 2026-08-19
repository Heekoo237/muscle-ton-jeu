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

**Ce que « lire » recouvre.** Le droit de LIRE inclut nommer un concept dans une LISTE FERMÉE définie par nous. Le code vérifie l'appartenance à la liste et redresse toujours le côté domicile/extérieur depuis la donnée en base, jamais depuis l'ordre d'affichage.

Le seul nombre que la vision peut émettre est un seuil de marché, contraint à {1.5, 2.5, 3.5} ET recoupé contre le texte lu. Aucun autre nombre ne sort d'un LLM.

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

**Plancher : au moins UNE sélection dans le ticket renforcé.** Le seul cas interdit est de tout retirer — on ne vide jamais le ticket. Un plancher plus haut (l'ancien « jamais moins de 4 ») produisait l'effet inverse de son intention : sur un ticket de 4 avec une sélection fragile, il empêchait tout retrait et le renforcé ressortait intact — l'analyse ne servait plus. On barre donc dès qu'il reste une ligne : deux matchs dont un fragile → renforcé à un match ; un seul match fragile → on le dit, sans produire de ticket vide.

**Si TOUTES les sélections sont fragiles**, on ne retire rien et on l'annonce : « Toutes tes sélections sont trop justes. On ne peut pas alléger ce ticket sans le vider. » On ajoute la sélection la plus serrée, pour qu'il reparte avec une information actionnable. On ne descend jamais à un renforcé qui ne serait qu'une fragile de plus. **Ce cas est facturé** (voir Règles de facturation) : on a lu, résolu, calculé et dit quelque chose d'utile.

**Quand on retire plus de la MOITIÉ des sélections analysables**, on le dit : « On a retiré 2 de tes 3 matchs. Ce qui reste est plus solide, mais c'est un ticket très différent du tien. » Le plancher à 1 autorise ces retraits massifs ; on ne laisse jamais croire qu'un bout du ticket est encore « le sien ».

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
| 8 | Toute migration qui ajoute une table, colonne ou fonction **lue par le code** ajoute sa ligne à `packages/db/schema_manifest.json` **dans le même commit** — au même titre qu'un test. C'est le contrat code↔base, vérifié en continu |

**Pourquoi la règle n°8 — le code déployé n'est pas toujours le schéma en base.** Deux fois un déploiement a cassé le produit parce que le code attendait une colonne/fonction que la base n'avait pas (migration non appliquée) — et **rien ne l'a signalé avant le clic d'un utilisateur** (500). Depuis : un **manifeste** (`packages/db/schema_manifest.json`) liste les objets que le code exige, avec leur numéro de migration. Une fonction SQL `verifier_schema` (migration 0019) compare ce manifeste au schéma réel et renvoie **ce qui manque**. Deux consommateurs, un seul manifeste : l'endpoint **`/api/health/schema`** (à ouvrir après chaque migration) et la **surveillance `health.py`** (cron 6 h → **alerte email** si un objet manque, « Manquant : `users.analyses_offertes_utilisees` (migration 0014) »). Mieux vaut un refus explicite qu'un 500 découvert par l'utilisateur — même principe que le garde-fou anti-factice. **Ajouter une colonne sans sa ligne de manifeste, c'est livrer un test qui ne tourne pas.**

**Pourquoi la règle n°7 — le code testé n'est pas toujours le code exécuté.** On a perdu des heures à diagnostiquer un « bug » du modèle (75 % des matchs sans probabilité) qui n'en était pas un : le nocturne avait tourné à 14 h 04 avec l'**ancienne** fenêtre de 7 jours, et le correctif 21 jours n'a été commité qu'à 15 h 49. Les données regardées venaient d'un code déjà remplacé. Depuis : chaque job imprime `[job] commit <sha>` en première ligne (`pipeline/version.py`, alimenté par `GITHUB_SHA`), et l'application expose son commit sur **`/version`** (`VERCEL_GIT_COMMIT_SHA`). Avant tout diagnostic sur des données, on **vérifie** quel commit les a produites — on ne le suppose jamais. Rappel de terrain : tout tourne en **schedule GitHub Actions depuis la branche par défaut** (`collecte-cotes.yml`) — le **nocturne à 4 h UTC** (1×/jour), le **collecteur + règlement + surveillance toutes les 6 h**, le **rendez-vous du matin à 7 h UTC**. Vérifié dans l'historique des runs (`event = schedule`), pas supposé. Le déclenchement `schedule` de GitHub ne part QUE depuis la branche par défaut : si un jour le dépôt gagne une vraie `main`, il faut y porter ce workflow.

**Pourquoi deux écrivains (règle n°1).** Le modèle (Dixon-Coles) a besoin d'un ajustement : il ne peut se calculer qu'une fois par nuit, au nocturne. La cote seule, elle, est un simple dévigeage déterministe de la cote — disponible dès que la cote est en base. Faire attendre le nocturne pour l'écrire créait un trou : un match coté à midi restait « pas encore de données » jusqu'à l'aube. Le collecteur l'écrit donc dans la foulée de la collecte. Les deux écrivains passent par **la même fonction** (`predictions_io.cote_seule_rows` → `league_predictions_cote_seule`), alimentée par **la même lecture de cotes** : sur une même entrée, une même valeur — aucune divergence possible. L'invariant est **vérifié**, pas supposé (`test_two_writers.py`). Ce qui ne change pas : le chemin temps réel **lit** toujours, il ne calcule rien ; la source reste `cote_seule`/`cote_derivee`, confiance basse.

**Intérim cote seule aussi pour les championnats MODÈLE.** Le nocturne ne passe qu'une fois par jour : un match d'un championnat modèle collecté après 4 h n'avait aucune probabilité avant le lendemain (trou de ~24 h). Le collecteur écrit donc un **intérim cote seule** pour ces matchs aussi (trou ramené à ≤ 6 h), **sans jamais écraser ni rétrograder** une proba calibrée : il n'écrit que les matchs **sans** proba modèle (`predictions_io.fixtures_deja_modelisees`), et le nocturne écrase l'intérim ensuite. Coût fournisseur : **zéro** (les cotes sont déjà collectées ; le dévigeage est un calcul). Pendant l'intérim, la source est `cote_seule`/`cote_derivee` → l'app le lit en **régime cote** (aucun fait statistique, « d'après les cotes ») : jamais une explication calibrée sur une probabilité qui ne l'est pas. Invariant anti-clobber vérifié (`test_collector_interim.py`).

---

## Règles de facturation

| # | Règle |
|---|---|
| 1 | Le crédit se débite **à l'affichage réussi du résultat**, jamais avant |
| 2 | Le ticket est sauvegardé **dès la validation de lecture**, avant tout paiement |
| 3 | On ne bloque jamais l'entrée. On bloque uniquement l'affichage du résultat |
| 4 | Après paiement, retour **exactement sur le ticket en cours**, jamais sur l'accueil |
| 5 | Gratuit si : premier ticket, ticket entièrement solide, moins de 3 sélections analysables, même ticket sous 24 h |
| 6 | **« Toutes fragiles » est FACTURÉ**, pas gratuit. C'est un vrai service rendu — lecture, résolution, calcul, et l'information la plus utile : « tout ton ticket est trop juste ». À distinguer de « tout solide » (rien à retirer, ticket sain), qui reste gratuit. La gratuité « moins de 3 analysables » s'applique quand même : un ticket de 2 tout-fragiles reste gratuit |

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

**Sujet CLOS — la couverture n'est PAS le problème (mesuré, ne pas y revenir).** Le fournisseur price ~**44 compétitions football actives** (11 modèle · 7 éligibles · 26 cote seule), + les hors-saison qui se réactivent seules. `catalogue_sync` (toutes les 6 h) les **auto-active TOUTES** — aucune curation, aucun « au catalogue mais pas activé ». Sur un échantillon réel de refus, `hors_couverture` ne pesait que **5,6 %**, et tous légitimes (Danemark, D2 suédoise, Coupe de Grèce). Le budget tient large (~4 620 crédits/mois sur un palier de 20 000). Un **second fournisseur ne se justifie pas** tant que `hors_couverture` reste marginal et niche. La vraie cause des refus est ailleurs : `sans_donnee` (trou transitoire, réduit par l'intérim) et `non_resolu` (reconnaissance des noms d'équipes, NOTRE lacune — pas la couverture). Instrument de suivi : **`/api/health/couverture`**.

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

## Historique public — pas de taux de réussite, on montre la DÉTECTION

**Décision arrêtée. Ne pas la défaire sans relire tout ce qui suit.** L'historique public ne montre **jamais un taux de réussite de pari** (« X % de nos tickets passent », « X % du renforcé serait passé »). Il montre la **capacité de détection** de notre marquage fragile, au niveau MATCH :

> « Sur 100 matchs qu'on a marqués trop justes, X sont tombés. Sur ceux qu'on a laissés, seulement Y. »

Trois raisons, chacune bloquante à elle seule — ce n'est pas une préférence esthétique :

1. **Un taux de réussite du renforcé mesurerait un ARTEFACT, pas notre valeur.** Le ticket renforcé a, par construction, **moins de lignes** que l'original (on retire, on n'ajoute jamais — règle d'or n°3). Un combiné plus court passe mécaniquement plus souvent. Afficher « le renforcé passe à 90 % » revient à afficher « les paris courts passent plus » — un effet de structure, pas une preuve de savoir-faire.

2. **Un taux public sans rendement viole notre propre règle de sobriété — et le rendement est hors de portée.** Sur l'historique public, un taux de réussite est **toujours** accompagné du rendement à mise fixe (PRD §12, `BilanPublic`). Or le rendement suppose une cote, et la **règle d'or n°1 interdit d'utiliser `coteSaisie` dans un calcul** ; on n'a pas non plus la cote de marché par sélection au moment du jeu. Donc on **ne peut pas** produire le rendement qui devrait accompagner le taux. Un « taux de réussite » public conforme est **techniquement impossible** aujourd'hui.

3. **Un taux « suis nos retraits et ça passe » nous déguise en pronostiqueur** (ce que la règle d'or n°3 refuse) et se lit comme une **promesse de gain** (règle d'or n°2). La détection ne promet rien : elle dit « quand on pointe un match faible, il tombe vraiment plus » — du diagnostic, pas du gain.

**Pourquoi la détection est le bon chiffre.** C'est **ce que le backtest a mesuré** (calibration + seuil fragile), pas une statistique de production improvisée. Il est **conditionnel à notre marquage**, donc quasi **invariant au type de tickets** : si les utilisateurs se mettent à jouer des tickets courts et sûrs, un taux de réussite bondit sans qu'on ait changé — la détection, elle, ne bouge que si NOTRE détection change. Il est calculable sans cote, à partir de `selections.fragile` (persisté) et des scores `fixtures` (règlement déterministe, `settleMarket`).

**Garde-fous obligatoires si un jour on l'affiche :**
- **Rien sous 30 matchs FRAGILES réglés** (c'est le seau rare, la contrainte de précision — pas 30 tickets). En dessous, c'est du bruit présenté comme une preuve.
- Formulation en **détection**, jamais en taux de réussite de pari.
- Formule **validée juridiquement** avant mise en ligne (la frontière aide-à-la-décision / pronostic est exactement là).

**Ce qu'on peut afficher en second, sans incitation :** le constat factuel des sauvetages, au passé, sans appel à l'action — « 19 fois, on a retiré le match qui est tombé. » Et on **garde la liste brute visible, ratés compris** : la retirer pour ne montrer que nos réussites serait glisser vers le pronostiqueur par omission.

**Le calcul est préparé mais NON affiché** (`domain/detection.ts` + `fixtures/detectionStore.ts`, endpoint privé `/api/health/detection`). La donnée s'accumule dès maintenant depuis les sélections déjà persistées ; le jour où le volume est atteint, les chiffres existent. La page publique reste **vide** tant que le volume n'y est pas — une page vide est plus honnête qu'un chiffre bruité.

**Page publique construite : on montre l'EFFET DU RETRAIT avec les cotes (`domain/publicHistory.ts` + `fixtures/publicHistoryStore.ts`, route `(public)/historique`).** Trois disciplines, à ne PAS défaire :

- **L'en-tête est une BASCULE, jamais un ratio.** Formulation figée : *« 3 tickets ont basculé : perdus tels quels, gagnants après retrait des lignes trop justes. »* On donne **le nombre de bascules** (`resultat_originale = tombe` ET `resultat = passe`), **jamais** « 3 sur 12 ». Quelqu'un voudra simplifier en « 3 sur 12 » un jour — **ne le fais pas** : « 3 sur 12 » se lit comme un taux de réussite du renforcé, l'artefact du combiné plus court qu'on refuse (raison n°1 ci-dessus). La bascule dit l'effet de NOTRE marquage, pas un rapport de gains.
- **La cote combinée = PRODUIT des cotes transcrites, et elle ne viole PAS la règle d'or n°1.** C'est une multiplication de **faits lus** (cotes de la capture), affichée à côté des cotes individuelles — une cote mal lue est donc **visible et contestable**, pas une proba inventée invisible. Ce n'est ni une probabilité ni un gain (aucune mise), et elle n'influence **jamais** quelle ligne est gardée (la fragilité décide, sans cote). Elle vit dans le module d'**affichage** `publicHistory.ts` — **jamais** dans `ticket.ts` ni `settle.ts` (garde `no-cote-in-calc`).
- **Toujours au moins un échec affiché** (`tombe_malgre`), tiré sur 7 jours si le jour est vide — sinon la page redevient la vitrine qu'on refuse. Anonyme (« Ticket de 21h40 », jamais d'identifiant). Plancher **20 tickets réglés** (avec les DEUX verdicts — les tickets d'avant la migration 0018 n'en ont qu'un et ne comptent pas). Caché au CDN (`s-maxage`), pas de table de précalcul. **Formule validée juridiquement avant ouverture publique.**

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
