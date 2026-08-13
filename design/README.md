# Design — maquettes de référence (Claude Design)

Ces fichiers sont la **référence de composition** du produit. En cas de doute sur
la mise en page d'un écran, on s'y réfère. Le `DESIGN.md` (racine) reste
l'autorité sur les **tokens** (couleurs, typo, espacements, rayons) ; ces
maquettes font autorité sur la **composition**.

| Fichier | Écran(s) | Statut d'implémentation |
|---|---|---|
| `landing.html` | Landing publique (7 sections) | ✅ Implémentée à l'identique (`src/routes/+page.svelte`) |
| `ui-screens.html` | Accueil/dashboard · Validation de lecture · Résultat | À aligner |
| `resultat.html` | Écran de résultat détaillé (bandeau collant, synthèse, bascule) | À aligner |
| `resultat-app.html` | Variante résultat (app) | Référence |
| `ticket-row.html` | Composant ligne de ticket | Référence |

## La barre de qualité (établie par la landing)

Ce qui a été validé sur la landing et doit se retrouver partout :

- **Typographie** : Anton (titres), Geist (corps/UI), JetBrains Mono (cotes,
  heures, tickets papier) — **auto-hébergées** dans `apps/web/static/fonts`
  (sous-ensemble latin FR, 76 Ko). Jamais de repli Impact/system en production.
- **Couleurs** : crème `#F8F1E4`, encre `#24201B`, accent terracotta `#C93A1A`,
  ocre fragilité `#8C6309`. Un seul accent par écran visible.
- **Le module papier** : tickets de caisse (dents de scie, mono, ▲ ocre pour le
  fragile, lignes retirées barrées, totaux alignés). Jamais empilé.
- **Animation sobre** : marquee lente, `transform`/`opacity` uniquement,
  `prefers-reduced-motion` respecté. Aucun compteur animé, aucune célébration.
- **Précision** : espacements en `clamp()`, hauteurs de ligne réservées pour
  aligner, bords arrondis, aucune ombre (sauf la découpe du papier).

## Rendu des maquettes

Les `.dc.html` sont des exports Claude Design ; ils s'ouvrent dans un navigateur
grâce à `support.js`. On lit surtout leur **source HTML/CSS** directement — pas
besoin de les rendre pour implémenter.
