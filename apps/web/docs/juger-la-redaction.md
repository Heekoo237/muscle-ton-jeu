# Juger la rédaction — les cinq textes

Ce guide sert à **lire cinq analyses générées** sur cinq tickets différents, et à
juger une seule chose : *un parieur comprend-il en dix secondes pourquoi un match
a été retiré ?*

Aucune connaissance technique requise. Deux façons de faire.

---

## 1. Voir le rendu tout de suite (sans clé, texte de secours)

Le texte de secours (déterministe, sans modèle) montre déjà la **forme** : une
synthèse, puis une explication courte par sélection retirée, avec la distinction
« risqué » (badge rouge) / « la moins solide » (mention neutre).

Dans le dossier `apps/web`, lance :

```
npx vitest run writing.samples --reporter verbose
```

Les cinq textes s'affichent dans la console. C'est le **filet de sécurité** —
celui qu'on montre quand le modèle échoue deux fois de suite.

---

## 2. Voir le vrai texte du modèle (avec la clé)

Le vrai texte, vivant, vient du modèle. Il faut une **clé Anthropic** (la même
famille de modèle que la lecture d'image : Haiku 4.5, rapide et bon marché).

1. Récupère une clé sur console.anthropic.com (commence par `sk-ant-`).
2. Dans le dossier `apps/web`, lance :

```
MTJ_WRITER_KEY=sk-ant-xxxxx npx vitest run writing.samples --reporter verbose
```

Les cinq textes réels s'affichent, **et** le coût de chaque rédaction (en dollars
et en francs) apparaît sur une ligne `[rédaction] …`.

Parmi les cinq tickets : un a une **double chance retirée** (mention neutre,
jamais « fragile »), un autre a **trois fragiles**. C'est exactement ce qu'il
faut regarder.

---

## Ce que le texte a le droit de faire, et pas

- Il **décrit** des faits (« Napoli a perdu deux fois à domicile »). Il n'affirme
  **jamais** une cause (« on a retiré ce match parce que… ») : un garde-fou
  refuse « parce que », « car », « c'est pourquoi », « donc on a retiré ».
- Il n'écrit **aucun** nombre qu'on ne lui a pas donné. Les pourcentages inventés
  sont détectés et le texte régénéré (deux essais, puis le texte de secours).
- Il ne dit **jamais** de jouer ou de ne pas jouer, ne promet aucun gain, n'écrit
  jamais le mot « IA ».

Ces règles ne dépendent pas du modèle : elles sont vérifiées **après** chaque
génération, en production comme dans ce harnais.

---

## Le coût, en clair

Une rédaction = **un seul appel** au modèle pour tout le ticket.

| | Par ticket | 1 000 tickets | 20 000 tickets |
|---|---|---|---|
| Rédaction | ~1,1 F CFA (~0,0019 $) | ~1 150 F CFA (~1,9 $) | ~23 000 F CFA (~38 $) |

Repère produit : un ticket se vend **500 F CFA**. La rédaction pèse **~0,2 %** du
prix — très loin du seuil d'alerte (10 %). Avec la lecture d'image (~3 F CFA), le
coût variable total d'un ticket reste autour de **4 F CFA**, soit moins de 1 %.

> Ordres de grandeur (entrée ~900 tokens, sortie ~200, tarif Haiku 4.5 :
> 1 $/M entrée, 5 $/M sortie). La mise en cache du prompt système fait encore
> baisser l'entrée. Le coût réel s'affiche à chaque appel dans les logs.
