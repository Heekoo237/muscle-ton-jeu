# Polices — sous-ensembles à déposer ici

Budget total **≤ 76 Ko** (plafond système 120 Ko). Auto-hébergé, `woff2`, `font-display: swap`.
Les noms de fichiers ci-dessous sont ceux référencés par `@font-face` dans `src/app.css`.

| Fichier attendu | Famille | Poids | Sous-ensemble | Cible |
|---|---|---|---|---|
| `anton-latin-fr.woff2` | Anton (SIL OFL) | 400 | latin + `À-ÿ` FR | ~21 Ko |
| `geist-variable-latin-fr.woff2` | Geist Sans Variable (SIL OFL) | `wght 400–700` | latin FR | ~46 Ko |
| `jetbrains-mono-digits.woff2` | JetBrains Mono (SIL OFL) | 500 | `0-9 . , : / – + ( ) %` uniquement | ~9 Ko |

**Tant que ces fichiers sont absents**, les substituts métriquement proches déclarés
dans `--font-title` / `--font-body` / `--font-mono` prennent le relais (Impact/Oswald,
system-ui, ui-monospace). Aucun flash, aucune page cassée — conforme au §13.4 du DESIGN.md.

Ne jamais élargir le sous-ensemble mono au-delà des chiffres et de la ponctuation :
si un besoin de lettres en mono apparaît, l'exception mono est **abandonnée**, pas élargie.
