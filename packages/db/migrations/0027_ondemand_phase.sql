-- 0027 — ondemand_calls.phase : d'où vient l'appel à la demande.
--
-- La récupération à la demande tourne désormais à DEUX moments : au CHARGEMENT de
-- l'écran de validation (pour que l'aperçu « Analyser N sur M » soit juste — les
-- marchés événement BTTS/±1,5/±3,5 ne sont écrits que par cet appel) ET au
-- « finaliser ». Grâce à la dédup (revendiquer, 15 min) le finaliser ne rappelle
-- jamais le fournisseur pour ce que la validation a déjà demandé — mais pour le
-- VOIR, il faut savoir quelle phase a émis chaque appel. D'où cette colonne.
--
-- Nullable : les lignes d'avant cette migration n'ont pas de phase (comptées comme
-- inconnues dans /api/health/ondemand). Aucune contrainte, aucune valeur par défaut :
-- le code écrit toujours la phase explicitement.
alter table public.ondemand_calls add column if not exists phase text;

comment on column public.ondemand_calls.phase is
  'Phase émettrice de l''appel à la demande : validation | finaliser (null avant 0027).';
