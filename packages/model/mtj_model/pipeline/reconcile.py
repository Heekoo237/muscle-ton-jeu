"""
reconcile.py — APPLIQUE le regroupement club_id. ÉCRIT en base. Idempotent.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.reconcile

Applique EXACTEMENT ce que le dry-run (reconcile_dryrun) montre — même code de
regroupement (`club_grouping.regrouper`), pour que le dry-run PRÉDISE l'écriture :
  - regroupe sous un club_id les entités d'un MÊME CLUB RÉEL (clé de club identique
    ET signature de population compatible) ;
  - le GARDE DE POPULATION sépare ce qui ne peut pas être le même club (masculin/
    féminin, sélection/club, pays domestiques différents) — voir club_grouping ;
  - le garde de CO-OCCURRENCE dissout tout club qui contiendrait deux adversaires.

RÉVERSIBLE : on photographie l'état AVANT d'écrire dans `club_reconcile_backup`
(migration 0026) ; `reconcile_rollback` le restaure. JOURNALISÉ : combien changent,
ce qui fusionne, et les FAUX regroupements évités.

Après écriture, on RE-TESTE sur l'état final : si un couple d'adversaires partage un
club_id, on LÈVE (transaction annulée, rien n'est écrit).
"""
from __future__ import annotations

from collections import defaultdict

from .club_grouping import population_signature, regrouper
from .db import connect
from .sync import club_key

VOLUME_ALERT_MATCHS = 200  # au-delà, on regarde à l'œil (le dry-run plafonnait à ~116)
VOLUME_ALERT_ENTITES = 5

# DDL du point de retour. `reconcile` et `reconcile_rollback` l'assurent EUX-MÊMES
# (create if not exists) : c'est une table INTERNE au pipeline (jamais lue par l'app),
# pas un objet du contrat de schéma. On ne dépend donc pas de l'ordre d'application des
# migrations — la 0026 reste la DDL canonique, mais le job se suffit à lui-même.
BACKUP_DDL = """
    create table if not exists club_reconcile_backup (
        id bigint generated always as identity primary key,
        run_le timestamptz not null default now(),
        team_id bigint not null,
        club_id_avant bigint,
        club_key_avant text
    )
"""


def _charger(cur):
    """Entités avec leur CLÉ FOURNISSEUR (odds_api_key), pour la signature de population.
    On passe par league_catalog : les 11 championnats modèle ont un provider_ref en
    fd_code (D1, I1…), leur clé fournisseur vit dans league_catalog."""
    cur.execute(
        "select t.id, t.nom, t.club_id, t.club_key, coalesce(c.odds_api_key, l.provider_ref) "
        "  from teams t "
        "  left join leagues l on l.id = t.league_id "
        "  left join league_catalog c on c.fd_code = l.provider_ref"
    )
    rows = cur.fetchall()
    avant = {int(i): (int(cid) if cid is not None else None, ck) for i, _, cid, ck, _ in rows}
    entities = [
        {"id": int(i), "nom": nom, "club_key": club_key(nom), "sig": population_signature(sk)}
        for i, nom, _, _, sk in rows
    ]
    return entities, avant


def reconcile() -> dict:
    with connect() as con:
        with con.cursor() as cur:
            entities, avant = _charger(cur)
            cur.execute(
                "select team_home_id, team_away_id from fixtures "
                "where team_home_id is not null and team_away_id is not null"
            )
            pairs = [(int(h), int(a)) for h, a in cur.fetchall()]

            club_of, rapport = regrouper(entities, pairs)
            key = {e["id"]: e["club_key"] for e in entities}

            # POINT DE RETOUR : on photographie l'état AVANT d'écrire (un seul point à la
            # fois — on vide puis on réécrit). `reconcile_rollback` restaure ça tel quel.
            cur.execute(BACKUP_DDL)
            cur.execute("delete from club_reconcile_backup")
            cur.executemany(
                "insert into club_reconcile_backup (team_id, club_id_avant, club_key_avant) values (%s, %s, %s)",
                [(e["id"], avant[e["id"]][0], avant[e["id"]][1]) for e in entities],
            )

            for e in entities:
                cur.execute(
                    "update teams set club_key = %s, club_id = %s where id = %s",
                    (key[e["id"]], club_of[e["id"]], e["id"]),
                )

            # JOURNAL : combien changent, ce qui fusionne, ce qu'on a ÉVITÉ de fusionner.
            changes = sum(1 for e in entities if avant[e["id"]][0] != club_of[e["id"]])
            print(f"\nCHANGEMENTS : {changes} entité(s) changent de club_id "
                  f"(point de retour sauvegardé — {len(entities)} lignes).")
            print(f"Regroupements sains : {len(rapport['fusions'])} · "
                  f"FAUX regroupements évités (garde population) : {len(rapport['ecartes'])} · "
                  f"co-occurrence dissoute : {len(rapport['cooccurrence'])}")
            for f in sorted(rapport["fusions"], key=lambda x: -len(x["membres"]))[:12]:
                print(f"  regroupé « {f['cle']} » : " + " · ".join(sorted({m['nom'] for m in f['membres']})))
            for ec in rapport["ecartes"][:20]:
                print(f"  ÉVITÉ « {ec['cle']} » ({ec['raison']}) → {len(ec['sous_clubs'])} clubs distincts")

            # RELECTURE de l'état final (on teste ce qui est ÉCRIT, pas ce qu'on croit).
            cur.execute("select id, club_id from teams")
            cid = {int(i): int(c) for i, c in cur.fetchall() if c is not None}
            cur.execute(
                "select team_home_id, count(*) from fixtures group by team_home_id "
                "union all select team_away_id, count(*) from fixtures group by team_away_id"
            )
            matchs: dict[int, int] = defaultdict(int)
            for tid, n in cur.fetchall():
                if tid is not None:
                    matchs[int(tid)] += int(n)

            # TEST co-occurrence sur l'état final — bloquant (lève → rollback).
            post = [(h, a) for h, a in pairs if cid.get(h) is not None and cid.get(h) == cid.get(a)]
            if post:
                for h, a in post[:20]:
                    print(f"  ⛔ id{h} vs id{a} partagent club_id {cid.get(h)}")
                raise SystemExit("Co-occurrence VIOLÉE après écriture — transaction annulée.")

        n_clubs = len(set(cid.values()))
        ent: dict[int, set] = defaultdict(set)
        mt: dict[int, int] = defaultdict(int)
        for tid, c in cid.items():
            ent[c].add(tid)
            mt[c] += matchs.get(tid, 0)
        regroupes = sum(1 for c in ent if len(ent[c]) > 1)
        outliers = [(c, len(ent[c]), mt[c]) for c in ent
                    if mt[c] > VOLUME_ALERT_MATCHS or len(ent[c]) >= VOLUME_ALERT_ENTITES]

    print(f"\nRéconciliation : {len(entities)} entités → {n_clubs} clubs "
          f"({regroupes} regroupent plusieurs entités).")
    print("POST-ÉCRITURE — co-occurrence : 0 collision ✓ (deux adversaires ne "
          "partagent jamais un club_id).")
    print(f"POST-ÉCRITURE — volume : {len(outliers)} club(s) à regarder")
    for c, n_ent, n_mt in sorted(outliers, key=lambda x: -x[2])[:20]:
        print(f"  ⚠ club_id {c} : {n_ent} entités · {n_mt} matchs")
    if not outliers:
        print("  ✓ aucun volume anormal (max sous les seuils).")
    return {"entites": len(entities), "clubs": n_clubs, "regroupes": regroupes,
            "fusions": len(rapport["fusions"]), "ecartes": len(rapport["ecartes"])}


def main() -> None:
    reconcile()


if __name__ == "__main__":
    main()
