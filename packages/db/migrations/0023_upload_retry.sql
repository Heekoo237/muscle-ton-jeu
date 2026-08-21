-- 0023 — Journal des RÉESSAIS d'upload (robustesse sur réseau instable).
--
-- Le client réessaie tout seul quand une capture arrive incomplète : essai 2 avec
-- une compression PLUS DOUCE. On compte, par jour :
--   - uploads_essai2       : analyses qui ont eu besoin de l'essai 2 ;
--   - uploads_essai2_echec : celles qui échouent MALGRÉ les deux essais.
-- Ce chiffre décide si l'upload résumable vaut l'investissement — sans lui, on
-- rediscute à l'aveugle. L'« incomplete » qui a fini par passer (essai 2 réussi)
-- n'est PAS un refus : on ne le compte donc pas comme tel, seulement ici.

alter table vision_stats
  add column if not exists uploads_essai2       bigint not null default 0,
  add column if not exists uploads_essai2_echec bigint not null default 0;

-- Incrément ATOMIQUE du seau du jour. Upsert autonome : un échec pur (aucune
-- lecture réussie ce jour-là) crée quand même la ligne, sans fausser les autres
-- compteurs (lignes = 0 → aucun impact sur l'alerte d'incomplétude).
create or replace function record_upload_retry(p_echec boolean) returns void as $$
    insert into vision_stats (jour, uploads_essai2, uploads_essai2_echec, maj_le)
    values (current_date, 1, case when p_echec then 1 else 0 end, now())
    on conflict (jour) do update set
        uploads_essai2       = vision_stats.uploads_essai2 + 1,
        uploads_essai2_echec = vision_stats.uploads_essai2_echec
                               + case when p_echec then 1 else 0 end,
        maj_le               = now();
$$ language sql;
