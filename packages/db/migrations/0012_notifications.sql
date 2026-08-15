-- 0012 — Web Push : abonnements dédoublonnés + idempotence des envois.
--
-- Deux garde-fous portés par le schéma (rule notifications n°1 : UNE notification
-- par événement, jamais de doublon même si le job tourne deux fois) :
--   1. un endpoint de push est GLOBALEMENT unique → un même appareil ne crée
--      jamais deux abonnements (upsert sur l'endpoint) ;
--   2. `notifications_sent` porte une CLÉ d'événement unique → l'envoi est
--      idempotent : réémettre le même événement est un no-op (insert refusé).

-- Un endpoint identifie un appareil+navigateur : il est unique. Permet l'upsert
-- à l'abonnement et le nettoyage sur « 410 Gone » (abonnement expiré).
create unique index if not exists push_subscriptions_endpoint_key
    on push_subscriptions (endpoint);

-- Idempotence des notifications. La clé encode l'ÉVÉNEMENT, pas l'appareil :
--   - suivi de résultat : « settle:<ticketId> »      (un ticket réglé = un envoi)
--   - rendez-vous matin  : « matin:<userId>:<AAAA-MM-JJ> » (un par user et par jour)
-- Insérer AVANT d'envoyer, en s'appuyant sur l'unicité : si l'insert échoue, un
-- autre passage a déjà pris l'événement → on n'envoie pas une seconde fois.
create table if not exists notifications_sent (
    cle       text primary key,           -- clé d'événement (idempotence)
    user_id   bigint references users(id) on delete cascade,
    type      text not null,              -- 'settle' | 'matin' (diagnostic)
    envoye_le timestamptz not null default now()
);
create index if not exists notifications_sent_user_idx on notifications_sent (user_id, envoye_le desc);

alter table notifications_sent enable row level security;

-- Réservation ATOMIQUE d'un événement : insère la clé et renvoie true si CE passage
-- l'a réservée, false si elle existait déjà. Le règlement n'envoie le push QUE si
-- la réservation renvoie true — l'unicité de `cle` garantit un seul envoi, même sur
-- deux jobs concurrents (rule notifications n°1, vérifiée par test).
create or replace function reserver_notification(
    p_cle text, p_user_id bigint, p_type text
) returns boolean as $$
    insert into notifications_sent (cle, user_id, type)
    values (p_cle, p_user_id, p_type)
    on conflict (cle) do nothing
    returning true;
$$ language sql;
