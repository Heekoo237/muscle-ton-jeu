# Tester les notifications sur ton téléphone

Guide pas à pas, sans être développeur. Objectif : voir une vraie notification
arriver sur ton téléphone, sans attendre qu'un ticket se règle.

---

## Ce qu'il reste à brancher (une fois)

Tu as déjà mis les 3 clés VAPID dans Vercel et redéployé. Il reste **trois** choses.

### 1. Appliquer la migration à la base (Supabase)

Elle crée l'unicité des abonnements et la table anti-doublon.

- Ouvre **Supabase → ton projet → SQL Editor**.
- Ouvre le fichier `packages/db/migrations/0012_notifications.sql` du dépôt,
  copie tout son contenu, colle-le dans l'éditeur, clique **Run**.
- Ça ne dit rien de spécial = c'est bon (les `create … if not exists` sont sûrs à rejouer).

### 2. Créer deux secrets GitHub

Ils permettent au robot (GitHub Actions) de réveiller l'app pour régler les tickets.

- Va sur **GitHub → le dépôt → Settings → Secrets and variables → Actions → New repository secret**.
- Crée :
  - **`MTJ_APP_URL`** = l'adresse de ton site, ex. `https://jeu-web.vercel.app`
  - **`CRON_SECRET`** = le mot de passe partagé (dans le fichier que je t'envoie)

### 3. Mettre le même `CRON_SECRET` dans Vercel

- **Vercel → Settings → Environment Variables → Add New**
  - Nom : `CRON_SECRET` · Portée : **serveur** (ne pas préfixer `PUBLIC_`)
  - Valeur : **la même** que le secret GitHub ci-dessus
- **Redéploie** après l'ajout.

> Le `CRON_SECRET` doit être **identique** des deux côtés. GitHub l'envoie, Vercel le vérifie.

---

## Le test sur ton téléphone (Android, Chrome — 90 % des cas)

1. Ouvre ton site dans **Chrome** sur le téléphone.
2. **Connecte-toi** (Google).
3. Analyse un ticket jusqu'à l'écran **« Ton ticket, lu »** (le résultat).
4. En bas, tape **« Activer les notifications »**.
5. Chrome demande l'autorisation → **Autoriser**.
6. Le bouton devient **« Recevoir une notification de test »** → tape dessus.
7. **Une notification doit apparaître** en haut de ton téléphone :
   « Notification de test. Tout est bien branché. »
8. Tape la notification → elle ouvre l'app. ✅

Si tu la vois : le circuit complet marche (abonnement → serveur → Google → ton téléphone).

---

## Sur iPhone (marginal chez nous, mais géré)

Web Push sur iPhone exige d'**ajouter le site à l'écran d'accueil** d'abord.

- Si tu ouvres le site dans Safari **sans** l'avoir installé, le bouton n'essaie pas
  d'échouer : il affiche l'explication *« Sur iPhone, ajoute d'abord Muscle Ton Jeu à
  ton écran d'accueil… »*.
- Pour tester : bouton **Partager** de Safari → **Sur l'écran d'accueil** → ouvre
  l'app depuis l'icône → refais les étapes 3 à 8. (iOS 16.4 minimum.)

---

## Déclencher le règlement à la main (sans attendre un vrai match)

Deux façons de forcer les jobs, utiles pour vérifier :

- **La notification de test** (ci-dessus) — la plus simple, envoie un push à toi-même.
- **Le règlement complet** — depuis **GitHub → Actions → « Collecte des cotes » →
  Run workflow → choisir `regler-scores`**. Ça rafraîchit les scores des tickets en
  attente puis déclenche le règlement + le suivi de résultat. Le **rendez-vous du
  matin** se force pareil avec `notif-matin`.

Après un run, l'onglet **Actions** montre les compteurs :
`[settle-scores] … crédits=…` (ce que coûte la fonctionnalité, isolé du collecteur)
et `[cron settle] réglés=… notifiés=… retenus(nuit)=… déjà=…`.

---

## Cadence automatique (rappel)

- **Toutes les 6 h** : scores des tickets en attente + règlement + suivi de résultat.
- **7 h UTC (8 h locale)** : rendez-vous du matin, aux seuls comptes ayant l'analyse
  offerte disponible, les jours avec matchs.
- **Jamais** de notification entre **22 h et 7 h** locale : une notif prête la nuit
  part au réveil, elle n'est pas perdue.
- **Une seule** notification par événement, même si un job tourne deux fois.
