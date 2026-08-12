# Déploiement Vercel — Muscle Ton Jeu (app factice)

L'application web (`apps/web`) est prête pour Vercel. Aucune variable
d'environnement n'est nécessaire en mode factice.

## Étapes (tableau de bord Vercel)

1. **vercel.com → Add New → Project → Import Git Repository**, choisis
   `Heekoo237/muscle-ton-jeu`.
2. **Branch** : sélectionne `claude/muscle-ton-jeu-setup-v3uyry` (ou fusionne
   d'abord sur `main` et déploie `main`).
3. **Root Directory** : clique « Edit » et choisis **`apps/web`**.
   C'est le seul réglage important — Vercel détecte alors SvelteKit tout seul.
4. **Framework Preset** : SvelteKit (auto-détecté). Laisse les commandes par
   défaut (`vite build`, install `pnpm`).
5. **Deploy**. Au bout d'une minute tu as une URL `*.vercel.app`.

Le monorepo pnpm est géré automatiquement : Vercel installe depuis la racine et
construit `apps/web`. Le dossier Python `packages/model` est ignoré (hors du
Root Directory).

## Ce qui marche en ligne

Tout le parcours factice : landing, upload, validation, connexion, résultat +
module signature, image de partage, recharge Mobile Money simulée, dashboard.

## Limite connue (mode factice)

L'état (ticket en cours, crédits) est **en mémoire**, pas encore en base. Sur
Vercel (serverless), il tient pendant une session de clics continue, mais peut
se réinitialiser après une longue pause (démarrage à froid d'une fonction). Si
ça arrive, l'app te renvoie à l'upload — tu repars proprement.

La persistance réelle (Supabase : `tickets`, `credit_ledger`, `users`) est
l'objet de la Session 8. Le schéma est déjà écrit dans
`packages/db/migrations/0001_init.sql`.

## Domaine

Le gabarit de partage et les métadonnées référencent `muscletonjeu.com`. Tu
pourras brancher le domaine dans Vercel → Settings → Domains quand il sera prêt.
