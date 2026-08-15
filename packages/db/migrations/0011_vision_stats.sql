-- 0011 — Mesure de la variabilité de lecture VISION.
--
-- La vision (LLM) n'est pas déterministe : la même capture peut produire deux
-- lectures différentes. Le symptôme du bug observé = un marché 1X2/double chance
-- RECONNU mais dont l'issue pariée est VIDE (« lecture incomplète »). On agrège
-- par JOUR pour que la surveillance (health) alerte si le taux dérive, sans lire
-- les logs à la main. Un seau par jour (borné), pas une ligne par lecture.

create table if not exists vision_stats (
    jour             date primary key,
    tickets          bigint not null default 0,   -- analyses lues ce jour
    lignes           bigint not null default 0,   -- lignes lues au total
    incompletes      bigint not null default 0,   -- marché reconnu, issue vide
    retries          bigint not null default 0,   -- retries vision déclenchés
    retries_reussis  bigint not null default 0,   -- retries ayant récupéré ≥ 1 issue
    maj_le           timestamptz not null default now()
);

-- Incrément ATOMIQUE d'un seau quotidien (évite tout read-modify-write concurrent).
-- Appelé par l'app (Supabase RPC) après chaque résolution de ticket.
create or replace function record_vision_read(
    p_lignes int, p_incompletes int, p_retries int default 0, p_retries_reussis int default 0
) returns void as $$
    insert into vision_stats (jour, tickets, lignes, incompletes, retries, retries_reussis, maj_le)
    values (current_date, 1, p_lignes, p_incompletes, p_retries, p_retries_reussis, now())
    on conflict (jour) do update set
        tickets         = vision_stats.tickets + 1,
        lignes          = vision_stats.lignes + excluded.lignes,
        incompletes     = vision_stats.incompletes + excluded.incompletes,
        retries         = vision_stats.retries + excluded.retries,
        retries_reussis = vision_stats.retries_reussis + excluded.retries_reussis,
        maj_le          = now();
$$ language sql;
