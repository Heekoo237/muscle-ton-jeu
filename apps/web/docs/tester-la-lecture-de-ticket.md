# Tester la lecture d'un vrai ticket (guide pas à pas)

Objectif : envoyer une **vraie capture 1xBet / Betwinner** et voir **tes vrais
matchs** à l'écran de validation. Ce guide ne suppose aucune connaissance de
développement — suis les étapes dans l'ordre.

---

## Ce qu'il te faut avant de commencer

1. **Une clé Anthropic** (le modèle qui lit la capture).
   - Va sur `https://console.anthropic.com` → crée un compte → **API Keys** →
     *Create Key*. Copie la clé (elle commence par `sk-ant-…`).
   - C'est la seule dépense variable : environ 1 à 3 lectures par ticket, avec un
     modèle **rapide et bon marché** (Claude Haiku).

2. **Une base Supabase déjà remplie par le pipeline** (pour reconnaître les
   matchs). Si le pipeline nocturne a tourné, les matchs des 7 prochains jours
   sont en base. Il te faut, depuis le tableau de bord Supabase → *Project
   Settings → API* :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PUBLIC_SUPABASE_URL` (la même URL)
   - `PUBLIC_SUPABASE_ANON_KEY`

> Sans Supabase, l'application lit quand même ta capture (tu verras le texte
> extrait), mais elle compare tes équipes à une **liste de démonstration** : tes
> vrais matchs risquent d'apparaître « non reconnus ». Pour le vrai test, branche
> Supabase.

---

## Étape 1 — Créer le fichier de configuration

Dans le dossier `apps/web`, crée un fichier nommé **`.env.local`** (copie de
`.env.example`) et colle dedans, en remplaçant par tes valeurs :

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # secret, serveur uniquement
PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...

MTJ_VISION_KEY=sk-ant-...                 # ta clé Anthropic
```

Enregistre le fichier. Ces valeurs restent sur ta machine ; elles ne sont jamais
envoyées au navigateur.

---

## Étape 2 — Lancer l'application

Ouvre un terminal **dans `apps/web`** et tape :

```bash
pnpm install     # la première fois seulement
pnpm dev
```

Le terminal affiche une adresse, en général `http://localhost:5173`. Ouvre-la
dans ton navigateur (le téléphone marche aussi si tu es sur le même réseau).

---

## Étape 3 — Envoyer une vraie capture

1. Va sur **`http://localhost:5173/analyser`**.
2. Touche un emplacement **« Capture »** et choisis une **capture d'écran** de ton
   ticket 1xBet ou Betwinner (1 à 3 captures si le ticket est long).
   - L'image est **réduite automatiquement** avant l'envoi (ton forfait data est
     compté) : c'est normal que ça affiche « Préparation… » une seconde.
3. Touche **« Analyser mon ticket »**.
4. Après l'écran de lecture, tu arrives sur **la validation** : tes matchs, avec
   le marché reconnu pour chaque ligne. **C'est ça, le test réussi.**

---

## Étape 4 — Vérifier les cas d'échec (important)

Ces cas doivent donner un message clair **et ne rien débiter** :

| Ce que tu envoies | Ce que tu dois voir |
|---|---|
| Une photo quelconque (ton chat) | « Cette image n'est pas un ticket… » |
| Une photo d'un ticket **papier manuscrit** | « On lit les captures d'écran, pas les tickets papier » |
| Un fichier qui n'est pas une image | « Ce fichier n'est pas une image… » |
| Une capture floue / coupée | « On n'arrive pas à lire. Réessaie ou saisis à la main. » |

Aucun de ces cas ne crée de ticket ni ne consomme de crédit.

---

## Ce qui se passe sous le capot (pour ta tranquillité)

- Le modèle vision **transcrit** le texte du ticket. Il ne calcule aucune
  probabilité, ne choisit aucun match : **aucun chiffre affiché ne vient d'un
  LLM** (règle d'or n°1).
- La **reconnaissance des matchs** (fuzzy sur les noms + table d'alias, limitée
  aux 7 prochains jours) et des **marchés** (table stricte : certain / ambigu /
  inconnu) se fait par du **code déterministe**, pas par le modèle.
- Deux fois la même capture → **pas de nouvelle analyse** (empreinte). Si le
  réseau coupe pendant la lecture, renvoyer la même capture **retrouve le même
  ticket**, sans refacturer.
- Les captures sont stockées en privé et **purgées après 30 jours**
  (`/api/maintenance/purge-captures`, déclenché par le cron quotidien).

---

## Si ça ne marche pas

- **« On n'arrive pas à lire » sur une capture nette** : vérifie que
  `MTJ_VISION_KEY` (ou `ANTHROPIC_API_KEY`) est bien dans `.env.local` et relance
  `pnpm dev`. Sans clé, la vision reste factice.
- **Tes matchs apparaissent « non reconnus »** : la base n'a pas ces matchs dans
  les 7 prochains jours (pipeline pas à jour), ou tu es en mode démo (Supabase
  non configuré).
- **L'écran reste bloqué sur « Lecture en cours… »** : regarde le terminal, un
  message d'erreur y apparaît ; le plus souvent une clé manquante ou invalide.
