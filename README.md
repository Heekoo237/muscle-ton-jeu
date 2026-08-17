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
| Web | SvelteKit (Svelte 5), SSR sur **Vercel** (adapter-vercel), TypeScript |
| Style | CSS natif + custom properties (tokens `DESIGN.md`), zéro framework |
| Base / Auth / Stockage | Supabase (Postgres, Auth Google, Storage) |
| Modèle stat + backtest | Python (numpy/scipy/pandas), exécuté hors Vercel (cron CI) |
| Jobs planifiés | Vercel Cron + Supabase (réconciliation paiement, purge captures, suivi) |
| Image de partage | Satori + resvg (SVG→PNG, rendu serveur) |

> **Déploiement Vercel** : racine du projet = `apps/web`. Le pipeline nocturne
> Python (Poisson/Dixon-Coles + backtest) tourne via cron GitHub Actions et écrit
> dans `predictions` sur Supabase — jamais dans une fonction serverless. Vision :
> Gemini Flash ; rédaction : Claude (branchés en Session 8, derrière les services).

## Garde-fous d'exécution (perf + erreurs)

Un même principe que les garde-fous chiffrés du rédacteur (taux de bascule
template) : on **mesure**, on ne se fie pas à la vigilance.

- **Compteur de requêtes base par page** (`src/lib/server/dbmeter.ts`). Chaque
  requête `supabaseAdmin().from/rpc` est comptée dans un contexte par-requête
  (`AsyncLocalStorage`) ; le hook serveur journalise le total et émet un **WARN**
  au-delà de `DB_QUERY_WARN_THRESHOLD` (15). C'est ce qui rend visible une boucle
  N+1 (une lecture par match) — un bug qui, sans ça, passe la revue. Cherche
  `[dbmeter]` dans les logs Vercel. Au-delà du **plafond dur** `DB_QUERY_HARD_CAP`
  (60, très au-dessus du baseline ~11), le **coupe-circuit** lève et coupe la
  requête emballée avant qu'elle ne martèle la base.
- **Limitation de débit** (`src/lib/server/ratelimit.ts` + migration `0015`). Fenêtre
  fixe atomique en base (`hit_rate_limit`), donc partagée entre instances serverless.
  Appliquée à l'appel vision de `/analyser` (coûteux, non authentifié) — par IP et par
  compte (`RATE_LIMITS`). **Fail-open** : une panne du limiteur laisse passer (on ne
  bloque jamais un utilisateur légitime), l'incident est journalisé.
- **Session mise en cache par requête** (`getAppSession` via `event.locals`) : les
  trois `load` d'une page (layout app, layout dashboard, page) ne résolvent la
  session qu'**une** fois — plus de triple `auth.getUser` + triple lecture `users`.
- **Isolation d'erreur par section** (`src/lib/server/section.ts`) : un `load`
  enveloppe chaque lecture indépendante ; si une échoue, elle est journalisée et
  retombe sur un repli — la page rend le reste, jamais une 500 entière. La
  frontière : l'auth ne passe pas par `section()` (une session absente redirige) ;
  tout le reste, oui. Le `handleError` global reste le dernier filet (message
  lisible + lien support, jamais la stack à l'écran).

## Dette de bêta (à revoir à la fin de la bêta)

- **Offre à 7 analyses** : `ANALYSES_OFFERTES` (`src/lib/offer.ts`) vaut 7 pendant la
  bêta pour laisser les testeurs voir plusieurs cas. À la fin : repasser à **1**,
  sans migration (la base ne stocke que le nombre CONSOMMÉ, `users.analyses_offertes_utilisees` ;
  restantes = `max(0, ANALYSES_OFFERTES − utilisees)`).
- **Empreinte d'appareil relâchée pour l'offre** : le garde est le **compteur par
  compte** (7 sur un même téléphone, sinon les analyses 2–7 seraient bloquées). La
  vraie défense multi-compte est le **rate-limit de `/analyser`** (C1). À la fin de
  la bêta, décider avec les données d'usage : remettre l'empreinte, OU garder le
  compteur par compte si C1 protège assez. `offeredDeviceStore` reste en place mais
  n'est plus consulté par le chemin de l'offre.

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
