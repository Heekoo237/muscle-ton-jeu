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
  compte — **et au rendu de l'image de partage** (`/p/[code]/image`, rasterisation
  resvg lourde, non authentifiée : par IP, le CDN absorbant le trafic légitime).
  Réglages nommés dans `RATE_LIMITS`. **Fail-open** : une panne du limiteur laisse
  passer (on ne bloque jamais un utilisateur légitime), l'incident est journalisé.
- **Session mise en cache par requête** (`getAppSession` via `event.locals`) : les
  trois `load` d'une page (layout app, layout dashboard, page) ne résolvent la
  session qu'**une** fois — plus de triple `auth.getUser` + triple lecture `users`.
- **Isolation d'erreur par section** (`src/lib/server/section.ts`) : un `load`
  enveloppe chaque lecture indépendante ; si une échoue, elle est journalisée et
  retombe sur un repli — la page rend le reste, jamais une 500 entière. La
  frontière : l'auth ne passe pas par `section()` (une session absente redirige) ;
  tout le reste, oui. Le `handleError` global reste le dernier filet (message
  lisible + lien support, jamais la stack à l'écran).

### RÈGLE — toute boucle sur un service externe isole ET journalise ses échecs

Non négociable. **Toute boucle qui appelle un service externe (fournisseur, base,
stockage) DOIT (1) isoler l'erreur de chaque itération — une itération qui lève ne
prive jamais les autres — ET (2) journaliser explicitement ce qui a échoué.** Les deux,
toujours : isoler sans journaliser transforme une panne en silence.

Pourquoi cette règle existe. Le rafraîchissement des scores (`refresh_scores`) bouclait
sur toutes les ligues **sans aucun garde** : une seule ligue qui levait (clé de sport
morte, collision d'alias, hoquet réseau) **avortait toute la boucle**, et les ligues
suivantes ne recevaient jamais leurs scores cette nuit-là. Un match terminé restait
`scheduled`, sortait de la fenêtre `/scores` (3 j), et son score était **perdu pour
toujours**. Le défaut a vécu **depuis le début, invisible** : il a fallu qu'un testeur
remarque « tous mes tickets restent en attente » pour qu'on le trouve. **Le silence est
ce qui lui a permis de durer.** Le correctif : savepoint + `try/except` par ligue, plus
un compteur d'échecs persisté (`scores_echecs`) qu'une surveillance lit pour **alerter
sur récurrence** (une ligue qui échoue ≥ 2 des 3 dernières nuits).

Modèles de référence dans le code : le **collecteur** (`collector.py`, savepoint par
ligue), `settle_scores.py` (`try/except` par ligue), et le fit **nocturne** (per-league
`try/except`) suivent déjà la règle. Toute nouvelle boucle externe s'y conforme.

## Durcissement sécurité (audit)

Corrections issues de l'audit, dans l'ordre appliqué.

- **Débit de crédits ATOMIQUE** (`debiter_credits`, migration `0017`). Une seule
  requête décide ET applique le débit, le solde enforçé au niveau base
  (`credits >= cost`), la ligne de grand livre posée dans la MÊME transaction. Fin du
  read-then-write de `record()` sur le chemin de facturation et de la garde sur un
  solde de **session périmé** : deux affichages concurrents ne peuvent plus payer deux
  analyses avec le même solde de départ. `false` → solde insuffisant, l'affichage
  (jamais l'entrée) redirige vers la recharge.
- **En-têtes de sécurité** (`apps/web/vercel.json`, `headers` sur `/(.*)`). Posés
  côté Vercel pour couvrir aussi la landing **prérendue** (les en-têtes de réponse
  fixés au prerender ne survivent pas). CSP (`default-src 'self'` ; `script-src`/
  `style-src` avec `'unsafe-inline'` — l'app pose du style/script inline, aucun CDN
  externe ; `connect-src` borné à `*.supabase.co` ; `img-src` `self`/`data:`/`blob:`/
  `*.googleusercontent.com` pour les avatars Google ; `frame-ancestors 'none'`),
  HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy`.
- **Endpoints de diagnostic fermés** (`/api/health/persistence`, `/api/health/supabase`).
  Le premier **écrivait** en base (user + ticket + grand livre) sans authentification ;
  les deux passent désormais par `cronAutorise` (secret cron partagé) → `403` sinon.
  `whoami` reste ouvert : il ne renvoie que la session de l'appelant, rien d'autrui.

## Suppression d'une analyse — anonymisation, pas hard-delete

L'utilisateur peut supprimer une analyse de son historique. On le fait par
**anonymisation sur place**, jamais par suppression de la ligne (`ticketDeletion.ts`,
migration `0024`). Trois effets : (1) purge immédiate de la **capture** (seule vraie
donnée personnelle : objets du bucket + `ticket_images`) ; (2) `user_id → NULL` ;
(3) `supprime_le = now()` (marqueur d'audit). Confirmation **à deux temps** côté UI (un
tap accidentel n'efface pas une analyse payée) ; propriété **revérifiée côté serveur**
avant d'agir. **Les crédits ne sont jamais remboursés** (geste d'affichage).

Pourquoi ainsi. L'historique **public** s'alimente des tickets réglés, de façon
totalement **anonyme** (il ne lit jamais `user_id`). Supprimer la ligne effacerait cette
preuve ; la garder telle quelle avec `user_id` ne serait pas un vrai effacement. On rompt
donc le lien personnel (`user_id → NULL`) tout en conservant les faits **anonymes**
(sélections, verdicts, cotes) qui nourrissent le public et les agrégats. La ligne quitte
l'historique **privé** sans condition nouvelle : `listAnalysedTickets` filtre `user_id =
moi`, désormais `NULL`.

**Nuance juridique — À FAIRE VALIDER PAR UN JURISTE avant la bêta publique.** Ce choix
traite la suppression comme un **effacement-par-anonymisation** (RGPD art. 17) : le lien
personnel est réellement rompu, donc défendable, et cohérent avec un historique public
déjà anonyme. **Si le conseil exige un hard-delete total**, on perdra la ligne réglée du
public — c'est le seul arbitrage, et il revient au métier. Point à confirmer avant
ouverture : la donnée résiduelle (verdicts, cotes transcrites) est-elle jugée
non-identifiante ? Notre position : oui (aucun identifiant, libellés de marché et cotes
publiques). À acter par écrit.

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
