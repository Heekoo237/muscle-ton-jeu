"""
reconcile.py — APPLIQUE le regroupement club_id. ÉCRIT en base. Idempotent.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.reconcile

Applique EXACTEMENT ce que le dry-run (reconcile_dryrun) a montré :
  - chaque entité reçoit sa clé de club (`sync.club_key`) et un `club_id` ;
  - club_id = plus petit id du groupe de même clé ;
  - EXCEPTION : une clé en COLLISION de co-occurrence (deux adversaires d'un même
    match partagent la clé) n'est JAMAIS fusionnée — ces entités gardent leur id
    propre comme club_id. Section 3 du rapport, appliquée à la lettre.

Après écriture, on RE-TESTE sur l'état final :
  - co-occurrence : aucun couple d'adversaires ne partage un club_id → sinon on
    LÈVE (la transaction est annulée, rien n'est écrit) ;
  - volume : on signale tout club au nombre de matchs / d'entités anormal.
"""
from __future__ import annotations

from collections import defaultdict

from .db import connect
from .sync import club_key

VOLUME_ALERT_MATCHS = 200  # au-delà, on regarde à l'œil (le dry-run plafonnait à ~116)
VOLUME_ALERT_ENTITES = 5


def reconcile() -> dict:
    with connect() as con:
        with con.cursor() as cur:
            cur.execute("select id, nom from teams")
            teams = [(int(i), nom) for i, nom in cur.fetchall()]
            cur.execute(
                "select team_home_id, team_away_id from fixtures "
                "where team_home_id is not null and team_away_id is not null"
            )
            pairs = [(int(h), int(a)) for h, a in cur.fetchall()]

            key = {tid: club_key(nom) for tid, nom in teams}
            groups: dict[str, list[int]] = defaultdict(list)
            for tid, _ in teams:
                groups[key[tid]].append(tid)

            # Section 3 : clés où deux adversaires se rejoignent → JAMAIS fusionnées.
            colliding = {key[h] for h, a in pairs if key[h] == key[a]}

            club_of: dict[int, int] = {}
            for ck, ids in groups.items():
                shared = min(ids)
                for tid in ids:
                    club_of[tid] = tid if ck in colliding else shared

            for tid, _ in teams:
                cur.execute(
                    "update teams set club_key = %s, club_id = %s where id = %s",
                    (key[tid], club_of[tid], tid),
                )

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

    print(f"Réconciliation : {len(teams)} entités → {n_clubs} clubs "
          f"({regroupes} regroupent plusieurs entités).")
    print(f"Clés en collision EXCLUES (section 3) : {len(colliding)}")
    print("\nPOST-ÉCRITURE — co-occurrence : 0 collision ✓ (deux adversaires ne "
          "partagent jamais un club_id).")
    print(f"POST-ÉCRITURE — volume : {len(outliers)} club(s) à regarder")
    for c, n_ent, n_mt in sorted(outliers, key=lambda x: -x[2])[:20]:
        print(f"  ⚠ club_id {c} : {n_ent} entités · {n_mt} matchs")
    if not outliers:
        print("  ✓ aucun volume anormal (max sous les seuils).")
    return {"entites": len(teams), "clubs": n_clubs, "regroupes": regroupes,
            "collisions_exclues": len(colliding)}


def main() -> None:
    reconcile()


if __name__ == "__main__":
    main()
