-- 0022 — Compteur quotidien des REFUS d'analyse, par raison.
--
-- « Un utilisateur refusé à la porte ne se plaint pas — il disparaît. » C'est le
-- seul échec qu'on ne voyait NULLE PART : `record_vision_read` ne compte que les
-- lectures RÉUSSIES, et l'échec retourne avant. On agrège ici par JOUR et par
-- RAISON (seau borné, pas une ligne par refus), pour que la surveillance alerte
-- si le taux de refus « contenu » (pas_un_ticket / illisible / incomplete) dérive.
--
-- Raisons possibles : aucune · pas_une_image · trop_de_tentatives · indisponible
--                     · pas_un_ticket · illisible · incomplete

create table if not exists vision_refus (
    jour    date        not null,
    raison  text        not null,
    n       bigint      not null default 0,
    maj_le  timestamptz not null default now(),
    primary key (jour, raison)
);

-- Télémétrie interne : jamais exposée au client. Le service role (app + cron)
-- contourne la RLS ; anon/authenticated n'ont AUCUNE policy → aucun accès.
alter table vision_refus enable row level security;

-- Incrément ATOMIQUE d'un seau (jour, raison) — pas de read-modify-write concurrent.
-- Appelé par l'app (Supabase RPC) à chaque refus d'analyse, best-effort.
create or replace function record_vision_refus(p_raison text) returns void as $$
    insert into vision_refus (jour, raison, n, maj_le)
    values (current_date, p_raison, 1, now())
    on conflict (jour, raison) do update set
        n      = vision_refus.n + 1,
        maj_le = now();
$$ language sql;
