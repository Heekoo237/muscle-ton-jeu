# PRD — Muscle Ton Jeu

**Version 1.0 · Document de référence produit**

---

## 1. Résumé

Muscle Ton Jeu est un outil d'analyse et d'aide à la décision destiné aux parieurs de football d'Afrique francophone.

L'utilisateur envoie la capture d'écran de son ticket de paris. Le système lit chaque sélection, calcule la probabilité réelle que le ticket entier passe, identifie les sélections les plus fragiles, et propose une version renforcée du même ticket obtenue en retirant ces sélections.

**Ce n'est pas un bookmaker.** Aucune mise n'est acceptée, aucun gain n'est versé, aucun lien vers un opérateur de paris n'existe dans le produit.

---

## 2. Marché et utilisateur

### 2.1 Marchés cibles

Cameroun et Bénin en priorité. Côte d'Ivoire, Sénégal, Togo, Gabon en extension.

### 2.2 Utilisateur type

- Homme, 20 à 35 ans
- Douala, Yaoundé, Cotonou, Abidjan
- Joue des tickets combinés de 6 à 15 sélections sur 1xBet, Betwinner, Premier Bet, Melbet
- Téléphone Android d'entrée de gamme, stockage saturé, forfait data compté
- Membre de groupes WhatsApp de parieurs
- Consomme du contenu paris sur TikTok et Telegram
- Sait déjà qu'un seul match peut faire tomber un ticket : **il n'y a aucune pédagogie à faire sur le problème**

### 2.3 Contraintes qui découlent de ce profil

- Le produit doit être lisible et utilisable à 360 px de large
- Il doit se charger en connexion faible
- Aucune installation d'application n'est requise en v1
- Le paiement passe par Mobile Money, pas par carte bancaire
- Les prix doivent être alignés sur les montants de recharge téléphonique habituels

---

## 3. Positionnement

### 3.1 Ce que le produit promet

Une lecture chiffrée et vérifiable d'un ticket, avant qu'il soit validé chez le bookmaker.

### 3.2 Ce que le produit ne promet jamais

Aucun gain, aucune garantie de résultat, aucun pronostic. Sous aucune formulation, même implicite.

### 3.3 Les trois différenciateurs

1. **L'analyse porte sur le ticket entier, pas sur un match isolé.** C'est l'unité réelle du joueur.
2. **L'historique est public et horodaté avant coup d'envoi**, ratés inclus, non modifiable après.
3. **Le taux de réussite n'est jamais affiché seul.** Il est toujours accompagné du rendement à mise fixe.

Le point 3 est structurant. Un taux de réussite seul ne veut rien dire : n'importe qui peut afficher 92 % en ne prédisant que « plus de 0,5 but » et faire perdre de l'argent à ses utilisateurs. Le rendement est le seul chiffre honnête. C'est la règle du produit et elle ne se négocie pas.

---

## 4. Fonctionnalité centrale — l'analyse de ticket

### 4.1 Entrée

- 1 à 3 captures d'écran maximum par ticket
- Formats acceptés : les captures d'écran d'applications ou de sites de bookmakers
- **Les tickets manuscrits sur papier ne sont pas acceptés.** Message explicite en cas de tentative.

### 4.2 Marchés couverts

| Marché | Couvert |
|---|---|
| Victoire domicile / nul / victoire extérieur (1X2) | Oui |
| Double chance (1X, X2, 12) | Oui |
| Plus / moins de buts (1.5, 2.5, 3.5) | Oui |
| Les deux équipes marquent | Oui |
| Score exact | Non en v1 |
| Handicap asiatique | Non en v1 |
| Corners, cartons, tirs | **Jamais** — aucune donnée derrière |
| Buteur, mi-temps / fin de match | Non en v1 |

Une sélection portant sur un marché non couvert est affichée comme « non analysée » et **n'est jamais facturée**. Une probabilité n'est jamais produite pour un marché non couvert.

### 4.3 Sortie

L'utilisateur reçoit :

1. **La probabilité réelle** que son ticket entier passe
2. **Une note par sélection** : solide, correcte, fragile
3. **Le ou les maillons faibles** identifiés, avec la raison en deux lignes
4. **Le ticket renforcé** : le même ticket, sélections fragiles retirées
5. **La nouvelle probabilité** et la nouvelle cote totale, affichée honnêtement même si elle est plus basse
6. **Une explication en français simple**, sans jargon statistique
7. **Un niveau de confiance** — le produit reconnaît quand il ne sait pas

### 4.4 Règles de construction du ticket renforcé

- **Retrait uniquement.** Le système ne propose jamais une sélection que l'utilisateur n'a pas lui-même choisie.
- Aucun remplacement de marché, aucun ajout de match.
- Seuil de fragilité calibré sur données historiques, pas fixé arbitrairement.
- **Plancher à 4 sélections** : on ne réduit jamais un ticket en dessous de 4, même si le seuil le justifierait.
- Si aucune sélection n'est fragile, le message est : « Rien à retirer. Ton ticket tient debout. » — et **l'analyse n'est pas facturée**.

---

## 5. Parcours utilisateur

### 5.1 Premier passage (utilisateur nouveau)

| Étape | Écran | Ce qu'on demande |
|---|---|---|
| 1 | Accueil | Rien — un seul bouton |
| 2 | Envoi | 1 à 3 captures. Rien d'autre |
| 3 | Lecture en cours | — |
| 4 | **Validation de lecture** | Corrections éventuelles |
| 5 | Analyse en cours | — |
| 6 | **Mur** | Connexion Google, un tap |
| 7 | **Résultat complet** | — |
| 8 | Notification | Un tap pour accepter |
| 9 | Partage | — |

**Le premier ticket est entièrement gratuit et entièrement visible.** Aucun floutage, aucune restriction, aucun contenu masqué. L'utilisateur doit vivre le produit complet au moins une fois — c'est ce qu'il racontera dans son groupe WhatsApp.

### 5.2 Passages suivants avec crédits

Capture → validation → analyse → résultat → débit du crédit.

### 5.3 Passages suivants sans crédits

Capture → validation → **écran de blocage** → recharge → retour automatique sur le ticket → résultat → débit.

**On ne bloque jamais l'entrée. On bloque uniquement l'affichage du résultat.** Un solde à zéro n'empêche jamais de composer ou d'envoyer un ticket.

### 5.4 Écran de blocage

```
Ton ticket est prêt.
9 matchs · 2 crédits nécessaires

Il te reste 0 crédit.

[ Recharger ]

Ton ticket est gardé. Tu le retrouveras ici.
```

Une seule action possible. Pas de bouton « annuler » ni « plus tard ».

---

## 6. Écran de validation de lecture

C'est l'écran qui détermine le taux de plainte du produit. Il doit se traiter au pouce en moins de 15 secondes.

### 6.1 Trois états par ligne

| État | Condition | Action |
|---|---|---|
| Vert | Match et marché reconnus avec certitude | Aucune |
| Orange | Ambigu — plusieurs interprétations possibles | Un tap, deux choix proposés |
| Rouge | Non reconnu ou marché non couvert | Corriger ou retirer |

**L'état « probable » n'existe pas.** Si la table de correspondance ne reconnaît pas une notation, la ligne est rouge. Le système ne devine jamais un marché.

### 6.2 Règles d'affichage

- Chaque ligne est affichée **en français**, jamais en notation de bookmaker.
  Correct : « Arsenal ou match nul ». Incorrect : « 1X ».
- **Correction par sélection uniquement.** Aucune saisie clavier. L'utilisateur tape sur la ligne et choisit dans une liste.
- Le bouton final indique toujours le nombre réel de matchs analysés : « Analyser 7 matchs sur 9 ».
- Les lignes rouges ne sont jamais comptées dans le prix.

### 6.3 Cas ambigus fréquents à traiter explicitement

| Cas | Traitement |
|---|---|
| `1X` sans libellé de colonne | Question : « Arsenal ou nul » / « Arsenal gagne » |
| `Over` / `TB` sans seuil visible | Question avec trois seuils : 1.5, 2.5, 3.5 |
| Marché mi-temps (`1MT`, `HT/FT`) | Rouge — non couvert, message explicite |

---

## 7. Compte et authentification

- **Connexion Google uniquement.** Un seul tap.
- Pas d'email/mot de passe, pas de SMS OTP, pas de récupération de compte à développer.
- Le mur de connexion est placé **après l'analyse, juste avant l'affichage du résultat**.
- Un lien discret « Problème pour te connecter ? » pointe vers le WhatsApp support, pour les cas marginaux.

**Justification :** l'email/mot de passe ne protège de rien (un Gmail jetable est gratuit et infini) et coûte un service d'envoi d'emails. Le SMS OTP coûte 30 à 80 F par envoi, ce qui est absurde sur un produit à 500 F le ticket. Google effectue la vérification téléphone à notre place, gratuitement.

---

## 8. Crédits et paiement

### 8.1 Tarification par longueur de ticket

| Sélections | Coût |
|---|---|
| 2 à 6 | 1 crédit |
| 7 à 12 | 2 crédits |
| 13 à 20 | 3 crédits |
| Plus de 20 | **Bloqué** |

Le compteur de crédits nécessaires est visible **pendant** la composition, jamais découvert à la fin.

### 8.2 Message au-delà de 20 sélections

« Au-delà de 20 matchs, aucune lecture ne peut t'aider utilement. Les chances sont proches de zéro quelle que soit l'analyse. »

Blocage effectif. Le plafond n'est pas contournable, y compris avec des crédits disponibles.

### 8.3 Packs de recharge

| Pack | Prix | Crédits |
|---|---|---|
| Ticket | 500 F | 5 crédits |
| Journée | 2 000 F | 25 crédits |
| Week-end | 5 000 F | Illimité 72 h |

**Règles :**
- Les crédits n'expirent jamais
- Pas d'abonnement
- Pas d'offre à vie
- Le pack mis en avant est celui qui couvre le ticket en cours

### 8.4 Gratuités permanentes

| Cas | Facturation |
|---|---|
| Premier ticket, utilisateur nouveau | Gratuit |
| Ticket entièrement solide, rien à retirer | Gratuit |
| Moins de 3 sélections analysables | Gratuit |
| Même ticket réanalysé sous 24 h | Gratuit |
| Correction et relance après édition | Gratuit |
| **Une analyse de match par jour** | Gratuit, permanent |

### 8.5 Règles de débit

- Le crédit se débite **à l'affichage du résultat**, jamais avant
- Toute panne survenant avant l'affichage est gratuite
- Le ticket est enregistré **dès la validation de lecture**, avant tout paiement
- Après paiement, l'utilisateur revient **exactement sur son ticket**, jamais sur l'accueil

### 8.6 Paiement Mobile Money

- Le paiement est asynchrone : la confirmation peut prendre 5 à 40 secondes
- L'écran attend activement, sans afficher d'erreur prématurée
- Au-delà de 2 minutes sans confirmation : « On vérifie encore. Tu recevras une notification dès que c'est crédité. » — jamais le mot « échec »
- Un bouton « J'ai payé, je n'ai rien reçu » existe dès le jour 1, relié au WhatsApp support
- **Deux agrégateurs de paiement sont branchés dès le lancement.** Aucun point de défaillance unique sur l'encaissement.

---

## 9. Dashboard utilisateur

Une seule page. Ordre vertical strict.

### 9.1 Barre fixe (tous écrans)

`12 crédits` · **[Recharger]**

Le libellé du bouton est « Recharger », jamais « Acheter des crédits ».

### 9.2 Zone 1 — Action

Un seul bouton : **[ Analyser un ticket ]**

### 9.3 Zone 2 — Analyse du matin

Le match gratuit du jour, affiché directement, visible sans scroller.

### 9.4 Zone 3 — Mes tickets

Liste antéchronologique. Par ligne :

| Champ | Exemple |
|---|---|
| Date · nombre de matchs | `Sam. 14 · 9 matchs` |
| Ce qu'on avait dit | `3 marqués fragiles` |
| Ce qui s'est passé | `Tombé sur Lens – Nice` |
| Verdict | `La version renforcée serait passée` |

Trois états pour le troisième champ :
- `En attente · ce soir 20:45`
- `Ton ticket est passé`
- `Tombé sur [match]` + verdict

Un tap ouvre l'analyse complète, consultable à vie, jamais refacturée.

### 9.5 Zone 4 — Bilan

Trois chiffres, calculés automatiquement :

```
18 tickets analysés
47 matchs marqués fragiles
31 sont effectivement tombés
```

Ce bloc n'apparaît qu'à partir de 3 tickets analysés.

### 9.6 Pied de page

`Historique public` · `Jeu responsable` · `Aide` (WhatsApp support)

### 9.7 Encart premier passage

Après le ticket offert uniquement, un encart unique :

« Ton prochain ticket coûtera 2 crédits. Recharge à partir de 500 F. »

Il disparaît définitivement après la première recharge.

### 9.8 Ce qui ne figure pas sur le dashboard

Graphiques, courbes, badges, niveaux, séries de jours consécutifs, classement entre utilisateurs, historique des paiements, statistiques par championnat, profil, avatar.

Le classement entre utilisateurs est exclu délibérément : il constituerait une incitation à jouer davantage, ce qui est incompatible avec le positionnement.

---

## 10. Rétention

| Mécanique | Déclencheur | Message |
|---|---|---|
| **Suivi de résultat** | Fin des matchs du ticket | « Ton ticket est tombé sur X. C'était le match marqué fragile. » |
| **Rendez-vous du matin** | 8 h, jours de match | 1 analyse de match gratuite |
| **Solde bas** | Reste 1 crédit | « Il te reste 1 crédit avant le week-end » |
| **Match suivi** | Équipe suivie qui joue | Notification simple |
| **Parrainage** | Après une analyse | « Envoie à un ami, vous gagnez 2 crédits chacun » |

**Canal : notifications Web Push natives** (gratuites, illimitées, fonctionnent sur Chrome Android qui représente plus de 90 % du parc cible).

L'autorisation de notification est demandée **sur l'écran de résultat**, jamais à l'arrivée, avec la formulation : « On te prévient quand ton ticket est joué. »

WhatsApp est utilisé pour le **partage** (l'utilisateur envoie lui-même, coût nul) et pour le **support**, jamais comme canal de notification sortante.

---

## 11. Image de partage

Générée côté serveur à partir d'un gabarit fixe. Aucune génération par IA.

Format vertical 1080 × 1350.

```
┌─────────────────────────┐
│  MUSCLE TON JEU         │
│                         │
│  MON TICKET   RENFORCÉ  │
│  1,3 %          7,5 %   │
│                         │
│  3 matchs retirés       │
│                         │
│  muscletonjeu.com       │
└─────────────────────────┘
```

**Les noms des matchs ne figurent pas sur l'image.** Celui qui la reçoit doit venir sur le site pour savoir lesquels.

---

## 12. Historique public

Page accessible sans compte.

- Chaque analyse est publiée et horodatée **avant le coup d'envoi**
- Aucune modification possible après publication
- Les analyses ratées sont affichées au même titre que les réussies
- **Deux chiffres toujours affichés ensemble** : taux de réussite et rendement à mise fixe
- Consultable depuis le premier jour d'activité

La page démarre vide et honnête (« On publie depuis le 3 septembre. 12 analyses. ») plutôt que remplie de contenu de démonstration.

---

## 13. Conformité

### 13.1 Règles produit

| # | Règle |
|---|---|
| 1 | Aucune mise acceptée, aucun gain versé |
| 2 | Aucun lien ni logo de bookmaker, aucun programme d'affiliation |
| 3 | Aucune promesse de gain, sous aucune formulation |
| 4 | Gate 18+ à l'inscription, mention permanente |
| 5 | Page « Jeu responsable » accessible depuis toutes les pages |
| 6 | Plafond de recharge auto-imposé (20 000 F par mois par défaut) |
| 7 | Aucun champ de mise, aucun affichage de « gain potentiel » |
| 8 | Le bouton d'action dit « Analyser mon ticket », jamais « Valider » ni « Parier » |
| 9 | Catégorie déclarée : Sports / Statistiques. Jamais Casino ni Paris |

### 13.2 Vocabulaire interdit

garanti · sûr · gagnant · imbattable · secret · méthode · gains · fixed · infaillible · « précision » employé seul sans rendement

### 13.3 Mentions obligatoires

- Hero : « Outil d'analyse et d'aide à la décision — pas un pronostic garanti · 18+ »
- Sous tout bloc de probabilité : « Une probabilité n'est pas une garantie. Joue de façon responsable · 18+ »
- Pied de page : mentions légales, CGU, confidentialité, jeu responsable

### 13.4 À faire valider par un avocat local, pays par pays

Statut de l'activité de conseil en paris, régime publicitaire, obligations de l'entité locale, fiscalité des services numériques, clause de redistribution commerciale des données sportives.

---

## 14. Ce qui n'est pas construit en v1

| Fonctionnalité | Report |
|---|---|
| Application native iOS / Android | Mois 3-4, après validation de la rétention |
| Chat IA libre | Non prévu |
| Analyse en direct pendant le match | Non prévu |
| Dashboard créateurs avec revshare | Tableur au départ |
| Abonnement mensuel | Non — le crédit est le modèle |
| Autres sports que le football | Non |
| Remplacement de sélection (vs retrait) | À réévaluer après v1 |
| Score exact, handicap asiatique | v2 |

---

## 15. Métriques de succès

| Métrique | Seuil de santé |
|---|---|
| Taux inscrit → premier payeur | ≥ 3 % |
| **Taux de recharge à J7** | **≥ 15 %** |
| Taux de recharge à J30 | ≥ 20 % |
| ARPU mensuel utilisateur actif | ≥ 1 200 F |
| Coût total par utilisateur servi | ≤ 15 % de l'ARPU |
| Taux d'échec de paiement | ≤ 10 % |
| Taux de correction sur l'écran de validation | ≤ 30 % des lignes |

**La métrique décisive est le taux de recharge à J7.** Le taux d'inscription mesure la qualité des créateurs, pas celle du produit.
