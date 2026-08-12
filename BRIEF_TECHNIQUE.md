# Brief technique — Muscle Ton Jeu

**Document d'architecture · À lire avant toute écriture de code**

---

## 1. Le principe fondateur

Le système se divise en deux moitiés séparées par une frontière stricte :

```
═══ AU-DESSUS DE LA FRONTIÈRE ═══
    Tout est calculé par du code déterministe.
    Statistiques, probabilités, sélection des lignes fragiles.

═══ FRONTIÈRE ═══

═══ EN DESSOUS ═══
    Le LLM ne fait que deux choses : lire une image, rédiger du texte.
    Il ne produit jamais un nombre.
```

**Un LLM à qui l'on demande une probabilité produit un nombre plausible et fabriqué.** Posez la question trois fois, vous obtenez trois réponses. Une hallucination sur du texte se repère ; une hallucination sur un nombre est indétectable. Aucun agent vérificateur ne peut corriger cela, car il n'a aucune référence contre laquelle vérifier.

La garantie anti-hallucination ne vient pas d'une surveillance. Elle vient du fait qu'**on ne donne jamais au LLM l'occasion de produire un chiffre**.

---

## 2. Le modèle statistique

### 2.1 Ce qu'il faut coder

Un modèle de Poisson bivarié avec ajustement Dixon-Coles. Littérature publiée depuis 1997. Environ 200 lignes de Python.

### 2.2 Les cinq étapes

**Étape 1 — Force de chaque équipe**

À partir des buts marqués et encaissés sur les 20 derniers matchs :
- Force offensive à domicile et à l'extérieur
- Force défensive à domicile et à l'extérieur
- Pondération par la force de l'adversaire rencontré
- Pondération exponentielle par la récence (un match d'il y a 2 semaines pèse plus qu'un match d'il y a 6 mois)

**Étape 2 — Buts attendus**

Deux nombres par match : λ_domicile et λ_extérieur.

**Étape 3 — Matrice de scores**

Loi de Poisson sur chaque équipe, produit croisé, grille 7 × 7 (scores de 0-0 à 6-6). Ajustement Dixon-Coles sur les scores faibles (0-0, 1-0, 0-1, 1-1) où la Poisson pure sous-estime la corrélation.

**Étape 4 — Marchés par sommation de la grille**

| Marché | Calcul |
|---|---|
| Victoire domicile | Somme des cases où buts_dom > buts_ext |
| Nul | Somme de la diagonale |
| Victoire extérieur | Somme des cases où buts_ext > buts_dom |
| Double chance 1X | Victoire domicile + nul |
| Double chance X2 | Nul + victoire extérieur |
| Double chance 12 | 1 − nul |
| Plus de N buts | Somme des cases où total > N |
| Moins de N buts | 1 − (plus de N) |
| Les deux marquent | Somme des cases où les deux valeurs > 0 |

**Étape 5 — Probabilité du ticket**

Produit des probabilités individuelles de chaque sélection.

*Note : cette formule suppose l'indépendance des sélections. C'est une approximation acceptable pour des matchs différents, mais fausse si deux sélections portent sur le même match. Détecter ce cas et le traiter à part.*

### 2.3 Le backtest — étape non négociable

Avant d'afficher un seul chiffre à un utilisateur, deux vérifications sur 2 saisons minimum :

**a) Calibration**
Regrouper toutes les prédictions par tranche de 5 % (les prédictions à 55-60 %, à 60-65 %, etc.) et vérifier que la fréquence observée correspond. Quand le modèle dit 60 %, l'événement doit se produire environ 60 % du temps. Un écart systématique signale un modèle mal calibré.

**b) Comparaison aux cotes de clôture**
Convertir les cotes de clôture en probabilités implicites, retirer la marge du bookmaker, comparer aux sorties du modèle. Le modèle ne doit pas être systématiquement décalé.

**c) Calibration du seuil « fragile »**
Le seuil ne se fixe pas arbitrairement. Il se détermine sur données réelles : à quel niveau de probabilité une sélection fait-elle statistiquement tomber un ticket ? Point de départ suggéré à tester : probabilité inférieure à 55 %.

**Si le modèle n'est pas calibré, ne pas construire la suite.** Le positionnement du produit repose sur des chiffres justes.

### 2.4 Ce qui rend le backtest possible

Le modèle est déterministe : même entrée, même sortie, toujours. On peut rejouer 40 000 matchs à travers lui.

Un système multi-agents ne peut pas être backtesté — c'est la raison technique principale pour laquelle il est exclu de cette architecture.

---

## 3. Données et fournisseurs

### 3.1 Pour le backtest — gratuit

**football-data.co.uk** — fichiers CSV téléchargeables, gratuits, contenant les résultats **et les cotes de clôture** de plusieurs bookmakers sur les grandes ligues européennes, sur de nombreuses saisons.

C'est le point de départ des semaines 1 et 2. Aucune intégration, aucun coût.

### 3.2 Pour la production

*Tarifs indicatifs, à vérifier sur les pages officielles avant engagement — ils évoluent chaque trimestre et une grande partie du comparatif public est produit par les vendeurs eux-mêmes.*

| Fournisseur | Ordre de prix | Notes |
|---|---|---|
| **football-data.org** | Gratuit / ~49 €+ | Seul gratuit durable. ~12 compétitions européennes majeures, 10 requêtes/minute. **Suffisant pour la v1.** |
| API-Football | ~19-50 $ | Prix d'entrée bas, plafond de requêtes journalier sur les petits paliers |
| Sportmonks | ~29 €+ | Tarification par nombre de ligues. xG, cotes et historique profond sont des add-ons séparés — la facture réelle peut monter très au-dessus du prix affiché |
| TheStatsAPI | ~50 $ | Annonce cotes + xG + historique en tarif unique |

**Recommandation : démarrer sur le gratuit de football-data.org.** Les 8 à 12 ligues majeures suffisent au marché cible. Passer au payant quand des utilisateurs payants existent.

### 3.3 Contrainte d'architecture

**Le fournisseur de données est encapsulé derrière un seul fichier de service.** Changer de fournisseur doit être un travail d'une journée, pas d'une semaine. Aucun appel direct à l'API depuis la logique métier.

### 3.4 Données nécessaires

| Donnée | Nécessité | Difficulté |
|---|---|---|
| Résultats et scores, 2 saisons | Indispensable | Facile |
| Calendrier à venir | Indispensable | Facile |
| Buts marqués/encaissés, domicile/extérieur | Indispensable | Facile |
| Cotes de clôture historiques | Fortement souhaitable | Moyenne |
| xG | Améliore nettement | Moyenne |
| Absences et blessures | Optionnel | Difficile, peu fiable |

---

## 4. Usage du LLM

Deux usages, deux exigences opposées. **Deux fonctions séparées, deux configurations séparées, aucune logique partagée** — il faut pouvoir changer de modèle sur l'une sans toucher à l'autre.

### 4.1 Lecture de la capture (vision)

- Volume : 1 à 3 appels par ticket
- Exigence : vision fiable, **coût serré** — c'est la seule dépense vraiment variable
- Choix : un modèle rapide et bon marché avec capacité vision
- Sortie attendue : JSON brut, une entrée par ligne lue

Ce que le modèle rend :
```json
{
  "lignes": [
    { "texte_brut": "Man Utd - Tottenham  1X  1.42" },
    { "texte_brut": "Arsenal - Liverpool  TB 2.5  1.85" }
  ],
  "cote_totale_lue": "24.50"
}
```

Le modèle **ne résout pas** les matchs ni les marchés. Il extrait du texte.

### 4.2 Rédaction de l'analyse

- Volume : 1 appel par ticket
- Exigence : qualité du français, respect strict des consignes de ton et de conformité
- Choix : un modèle de meilleur niveau

Le modèle reçoit un JSON contenant **tous les chiffres déjà calculés** et produit du texte. Il ne calcule rien, il ne sélectionne rien, il ne juge rien.

### 4.3 Contrôle post-génération

Après chaque génération de texte :

```
1. Extraire tous les nombres du texte produit (regex)
2. Vérifier que chacun figure dans le JSON d'entrée
3. Si un nombre est absent → régénérer
4. Après 2 échecs → afficher une version template sans chiffres
```

Environ 20 lignes de code. Garantie totale. **C'est cela, le contrôle anti-hallucination** — pas un agent supplémentaire.

### 4.4 Contrôle de conformité

Vérifier également l'absence des termes interdits dans le texte généré : garanti, sûr, gagnant, imbattable, secret, infaillible. Régénérer si présent.

---

## 5. Architecture — deux pipelines séparés

### 5.1 Pipeline A — nocturne, hors ligne

Tourne une fois par jour, vers 4 h du matin. Aucun utilisateur connecté.

```
1. Récupérer les résultats de la veille           → base
2. Récupérer le calendrier des 7 prochains jours  → base
3. Recalculer les forces d'équipes                → base
4. Pour CHAQUE match à venir :
     λ_domicile, λ_extérieur
     → matrice de Poisson 7×7
     → probabilité de chaque marché couvert
     → écrire dans la table predictions
5. Comparer aux cotes du marché
     → alerte si dérive anormale
6. Mettre à jour les résultats des tickets utilisateurs terminés
     → déclencher les notifications de suivi
```

À la fin du traitement, **toutes les probabilités des 300 prochains matchs sont calculées et stockées**.

### 5.2 Pipeline B — temps réel

Ne calcule **jamais** de probabilité. Lit, assemble, rédige.

```
Captures reçues (1 à 3)
  ↓
[code]  Empreinte anti-doublon, stockage
  ↓
[LLM vision]  Extraction du texte → JSON brut
  ↓
[code]  Résolution des matchs
            fuzzy matching sur noms + table d'alias
            restreint aux fixtures des 7 prochains jours
  ↓
[code]  Résolution des marchés
            table market_map stricte
            états : certain / ambigu / inconnu
            JAMAIS d'état "probable"
  ↓
► ÉCRAN DE VALIDATION ◄  l'utilisateur corrige
  ↓
[code]  Sauvegarde du ticket (AVANT tout paiement)
  ↓
[code]  Vérification du solde → écran de blocage si insuffisant
  ↓
[code]  Lecture des probabilités dans la table predictions
  ↓
[code]  Probabilité du ticket = produit des sélections
[code]  Marquage des lignes fragiles (seuil calibré)
[code]  Construction du ticket renforcé (retrait uniquement, plancher 4)
  ↓
[LLM rédaction]  JSON de chiffres → texte français
  ↓
[code]  Contrôle : tous les nombres du texte existent-ils en entrée ?
[code]  Contrôle : aucun terme interdit ?
  ↓
[serveur]  Génération de l'image de partage
  ↓
[code]  Affichage du résultat + DÉBIT du crédit
```

### 5.3 Pourquoi cette séparation

Le calcul est mutualisé : quand 400 utilisateurs mettent Arsenal–Liverpool dans leur ticket, aucun calcul n'est refait. On lit une ligne en base.

| | Approche multi-agents | Cette architecture |
|---|---|---|
| Appels LLM, ticket de 9 matchs | ~45 | **2** |
| Latence | 30-90 s | **6-10 s** |
| Même ticket deux fois | Résultats différents | **Résultat identique** |
| Backtest possible | Non | **Oui** |
| Hallucination sur les chiffres | Possible et indétectable | **Impossible par construction** |

C'est cette mutualisation qui rend un ticket à 500 F économiquement viable.

---

## 6. Parcours technique d'une requête

| # | Opération | Composant | Durée cible |
|---|---|---|---|
| 1 | Upload 1-3 images | Frontend | — |
| 2 | Stockage + empreinte | Backend | 200 ms |
| 3 | Extraction du texte | LLM vision | 2-4 s |
| 4 | Résolution match + marché | Code | 100 ms |
| 5 | Affichage validation | Frontend | — |
| 6 | Corrections | Frontend | — |
| 7 | Sauvegarde du ticket | Backend | 50 ms |
| 8 | Vérification du solde | Backend | 20 ms |
| 9 | Lecture des probas | Code | 20 ms |
| 10 | Calcul ticket + marquage + renforcé | Code | 10 ms |
| 11 | Rédaction | LLM | 3-5 s |
| 12 | Contrôles | Code | 5 ms |
| 13 | Image de partage | Serveur | 200 ms |
| 14 | Affichage + débit | Backend | 50 ms |

**Total : 6 à 10 secondes.**

---

## 7. Schéma de données

```
-- Données sportives
teams            id, nom, aliases[], ligue_id
leagues          id, nom, pays, actif
fixtures         id, date_utc, team_home_id, team_away_id, league_id,
                 statut, score_home, score_away
team_strength    team_id, calculé_le, attaque_dom, defense_dom,
                 attaque_ext, defense_ext
predictions      fixture_id, marché, probabilité, confiance, calculé_le
                 -- alimentée exclusivement par le pipeline nocturne

-- Utilisateurs
users            id, google_id, email, prénom, crédits, pays,
                 premier_ticket_utilisé, créé_le
tickets          id, user_id, statut, nb_sélections, coût_crédits,
                 proba_totale, proba_renforcée, créé_le, analysé_le
selections       id, ticket_id, fixture_id, marché, cote_saisie,
                 probabilité, fragile, retirée_du_renforcé
analyses         ticket_id, texte, image_url, créé_le
transactions     id, user_id, montant, crédits, statut, psp,
                 ref_externe, créé_le

-- Référentiels
market_map       notation_bookmaker, marché_interne, bookmaker
                 -- table stricte, enrichie manuellement
```

### 7.1 Les deux actifs propriétaires

`market_map` et le champ `aliases` s'enrichissent à chaque correction utilisateur. Ils ne se copient pas et constituent le seul avantage technique défendable du produit. Toute correction sur l'écran de validation doit alimenter une file de revue manuelle.

---

## 8. Résolution des marchés — table de correspondance

Fichier de configuration, pas de l'IA.

| Notation bookmaker | Marché interne |
|---|---|
| `1`, `W1`, `Victoire 1`, `Home` | WIN_HOME |
| `X`, `Nul`, `Draw` | DRAW |
| `2`, `W2`, `Away` | WIN_AWAY |
| `1X`, `10`, `Double chance 1X` | DC_HOME_DRAW |
| `X2`, `02` | DC_DRAW_AWAY |
| `12` | DC_HOME_AWAY |
| `TB 2.5`, `Plus 2.5`, `Over 2.5`, `Total > 2.5` | OVER_2_5 |
| `TM 2.5`, `Moins 2.5`, `Under 2.5` | UNDER_2_5 |
| `BTTS`, `Oui`, `Les deux marquent` | BTTS_YES |
| `BTTS Non`, `Non` | BTTS_NO |

Idem pour les seuils 1.5 et 3.5.

**Tout ce qui n'est pas dans cette table est INCONNU.** Jamais deviné, jamais interprété par un LLM.

---

## 9. Règles absolues de développement

| # | Règle | Vérifiable par |
|---|---|---|
| 1 | Aucun nombre affiché à l'utilisateur ne sort d'un LLM | Relecture de code + contrôle automatique |
| 2 | Toute probabilité vient de la table `predictions` | Aucun calcul dans le chemin temps réel |
| 3 | Un marché non reconnu est INCONNU, jamais deviné | Absence d'état « probable » |
| 4 | Le crédit se débite après l'affichage réussi | Test d'intégration |
| 5 | Le ticket est sauvegardé avant le paiement | Test d'intégration |
| 6 | Le fournisseur de données est derrière un seul fichier | Revue d'architecture |
| 7 | Deux agrégateurs de paiement branchés | Aucun point de défaillance unique |
| 8 | Aucun contenu payant envoyé au navigateur avant paiement | Le floutage CSS est interdit |

La règle 8 mérite une insistance : masquer visuellement un contenu déjà envoyé au navigateur est contournable en deux secondes avec les outils de développement. **Le serveur n'envoie jamais ce qui n'a pas été payé.**

---

## 10. Gestion des cas d'échec

| Cas | Fréquence | Comportement obligatoire |
|---|---|---|
| Capture illisible | Élevée | Message + réessai. **Aucun crédit débité** |
| Match mal reconnu | Élevée | Rattrapé par l'écran de validation |
| Match non couvert | Moyenne | Prévenir avant de débiter : « 7 matchs sur 9 seront analysés » |
| Données insuffisantes | Moyenne | Afficher « confiance faible », jamais inventer |
| Paiement échoué | Élevée | Écran de réessai + lien WhatsApp support |
| Paiement débité sans crédits | Rare, critique | Réconciliation automatique + bouton « J'ai payé, je n'ai rien reçu » |
| Réseau coupé pendant l'analyse | Élevée | Résultat disponible au retour, analyse non relancée |
| Ticket manuscrit envoyé | Occasionnelle | Refus explicite et clair |
| Deux sélections sur le même match | Occasionnelle | Détecter — le produit des probabilités est faux dans ce cas |

---

## 11. Ordre de construction

| Semaine | Livrable | Critère de réussite |
|---|---|---|
| **1** | CSV football-data.co.uk + Poisson/Dixon-Coles + probabilités des 4 marchés | Le modèle sort des chiffres sur 2 saisons |
| **2** | **Backtest : calibration + comparaison cotes de clôture** | Quand le modèle dit 60 %, l'événement arrive ~60 % du temps |
| **3** | Calibration du seuil « fragile » + pipeline nocturne + base de données | Les probabilités du jour sont en base chaque matin |
| **4** | Vision + résolution + écran de validation + calcul ticket + LLM rédaction | Un ticket complet de bout en bout |
| **5** | Google OAuth + crédits + paiement Mobile Money + image de partage | Un paiement réel qui aboutit et crédite |
| **6** | Historique public + Web Push + dashboard | Prêt pour les 3 premiers créateurs |

**La semaine 2 est la seule qui puisse tout arrêter.** Elle est ennuyeuse et invisible. Elle ne doit pas être compressée au profit du reste, qui est plus gratifiant à construire.

---

## 12. Infrastructure

| Besoin | Solution | Coût |
|---|---|---|
| Base de données | PostgreSQL | Faible |
| Cache | Redis | Faible |
| Authentification | Google OAuth | 0 € |
| Notifications | Web Push natif | 0 € |
| Image de partage | Rendu serveur (Satori, resvg ou équivalent) | ~0 |
| Stockage des captures | Objet, avec purge à 30 jours | Faible |
| Paiement | 2 agrégateurs Mobile Money | Commission |
| Tâches planifiées | Cron pour le pipeline nocturne | 0 € |

### 12.1 Estimation des coûts mensuels au démarrage

| Poste | Ordre de grandeur |
|---|---|
| API sportive | 0 à 50 € (gratuit possible en v1) |
| LLM vision | Variable selon volume — **à modéliser avant lancement** |
| LLM rédaction | Faible, 1 appel par ticket |
| Infrastructure | 30 à 100 € |

Le poste LLM vision est la seule ligne réellement variable. Elle doit être modélisée avec un scénario à 1 000 tickets par mois et un scénario à 20 000 avant le lancement des campagnes créateurs.
