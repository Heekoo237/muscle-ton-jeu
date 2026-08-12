# Muscle Ton Jeu

Outil d'analyse et d'aide à la décision pour parieurs de football en Afrique
francophone. **Ce n'est pas un bookmaker** : aucune mise, aucun gain versé,
aucun lien vers un opérateur.

L'utilisateur envoie la capture de son ticket. Le système lit chaque sélection,
calcule la probabilité que le ticket entier passe, identifie les sélections
fragiles, et propose une version renforcée **du même ticket, par retrait**.

> Documents de référence, par ordre d'autorité : `CLAUDE.md` (règles d'or, prime
> sur tout) · `PRD.md` · `BRIEF_TECHNIQUE.md` · `DESIGN.md` · `design/`.

## Le principe fondateur

Une frontière stricte sépare le produit en deux moitiés :

```
AU-DESSUS   Code déterministe. Statistiques, probabilités, sélection des fragiles.
────────────────────────────  FRONTIÈRE  ────────────────────────────
EN DESSOUS  Le LLM ne fait que deux choses : lire une image, rédiger du texte.
            Il ne produit JAMAIS un nombre.
```

La garantie anti-hallucination ne vient pas d'une surveillance : elle vient du
fait qu'on ne donne jamais au LLM l'occasion de produire un chiffre. Les
garde-fous `src/lib/server/domain/guards.ts` (contrôle des nombres + vocabulaire
interdit) sont vérifiés en CI.

## Stack

| Couche | Choix |
|---|---|
| Web | SvelteKit (Svelte 5), SSR via adapter-node, TypeScript |
| Style | CSS natif + custom properties (tokens `DESIGN.md`), zéro framework |
| Base / Auth / Stockage | Supabase (Postgres, Auth Google, Storage) |
| Modèle stat + backtest | Python (numpy/scipy/pandas) |
| Image de partage | Satori + resvg (SVG→PNG, rendu serveur) |

## Stratégie de construction

L'application complète est bâtie **avec des données factices**, chaque source
derrière une interface de service (`src/lib/server/services/`). Brancher le réel
= changer une seule fonction (`createXxxService`), jamais une refonte.

| Session | Livrable |
|---|---|
| **1** ✅ | Fondations : tokens, layout, 7 interfaces de service + fakes, moteur déterministe, garde-fous, schéma SQL, squelette Python |
| 2 | Surfaces publiques (landing, historique, jeu responsable) |
| 3 | Parcours de lecture (upload → vision → validation → sauvegarde) |
| 4 | Écran de résultat (module de comparaison signature) |
| 5 | Compte, crédits, paiement Mobile Money |
| 6 | Dashboard & rétention |
| **7** ⛔ | Modèle Poisson/Dixon-Coles + **backtest** (jalon-barrière, non compressible) |
| 8 | Branchement des vraies sources (une fonction à la fois) |

**La Session 7 est la porte de la production.** Aucun chiffre réel n'est montré
à un utilisateur avant que le backtest ne soit calibré (CLAUDE.md, brief §2.3).

## Développement

```bash
pnpm install
pnpm dev        # app web en local
pnpm test       # garde-fous + moteur déterministe (Vitest)
pnpm --filter web check   # typecheck
```

Arborescence : `apps/web` (SvelteKit) · `packages/model` (Python) ·
`packages/db/migrations` (schéma SQL, source de vérité).
