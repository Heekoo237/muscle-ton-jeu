# Brancher Supabase — checklist

Objectif : persistance réelle (fin des réinitialisations en serverless) + connexion
Google réelle. Tant que ce n'est pas fait, l'app reste en mode factice — rien ne casse.

## 1. Créer le projet

1. [supabase.com](https://supabase.com) → **New project**. Choisir une région proche
   (Europe/Ouest). Noter le mot de passe de la base.

## 2. Créer le schéma

1. Dans le projet → **SQL Editor** → **New query**.
2. Coller tout le contenu de `packages/db/migrations/0001_init.sql` → **Run**.
   (Ça crée les tables `users`, `tickets`, `selections`, `credit_ledger`, etc.)

## 3. Récupérer les clés

**Project Settings → API** :
- **Project URL** → `SUPABASE_URL` et `PUBLIC_SUPABASE_URL`
- **anon public** → `PUBLIC_SUPABASE_ANON_KEY`
- **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## 4. Renseigner les variables

Dans **Vercel → Settings → Environment Variables** (et en local dans `.env.local`) :

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...      # secret, serveur uniquement
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
```

Redéployer. Dès que ces variables existent, le produit bascule sur Supabase.

## 5. Connexion Google (Auth)

1. **Google Cloud Console** → APIs & Services → Credentials → **OAuth client ID**
   (type « Web »). Autoriser l'URL de redirection Supabase :
   `https://<projet>.supabase.co/auth/v1/callback`.
2. **Supabase → Authentication → Providers → Google** → activer, coller le Client ID
   et le Client Secret.
3. **Authentication → URL Configuration** → ajouter l'URL du site (Vercel) aux
   *Redirect URLs*.

## Ce dont j'ai besoin de toi pour brancher et tester

Le **Project URL**, la **clé anon** et la **clé service_role** (idéalement d'un projet
de dev). Avec ça, je câble les vraies implémentations derrière les interfaces de
service et je teste le parcours de bout en bout, puis tu mets les mêmes valeurs dans
Vercel pour la prod.
