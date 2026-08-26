"""reconcile_rollback.py — REVIENT EN ARRIÈRE sur la dernière réconciliation club_id.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.reconcile_rollback

Restaure, pour chaque équipe, le `club_id` et le `club_key` tels qu'ils étaient JUSTE
AVANT le dernier `reconcile` — depuis l'instantané `club_reconcile_backup` (migration
0026). Idempotent : rejouable, il réécrit le même état. Ne touche QUE `teams.club_id`
et `teams.club_key` — jamais les fixtures, ni les predictions, ni les tickets.

À lancer si la réconciliation a produit un effet indésirable qu'on ne voit qu'à
l'usage. Après restauration, l'instantané reste en place (on peut re-réconcilier).
"""
from __future__ import annotations

from .db import connect
from .version import print_banner


def rollback() -> dict:
    with connect() as con, con.cursor() as cur:
        cur.execute("select count(*), max(run_le) from club_reconcile_backup")
        n, run_le = cur.fetchone()
        if not n:
            print("Aucun point de retour en base (club_reconcile_backup vide) — rien à restaurer.")
            return {"restaures": 0}
        # Restaure l'état d'avant : club_id / club_key tels que photographiés.
        cur.execute(
            """
            update teams t
               set club_id = b.club_id_avant,
                   club_key = b.club_key_avant
              from club_reconcile_backup b
             where b.team_id = t.id
            """
        )
        restaures = cur.rowcount
    print(f"Restauration : {restaures} équipe(s) remises à l'état d'avant "
          f"la réconciliation du {run_le}. (fixtures / predictions / tickets : intouchés.)")
    return {"restaures": restaures, "point_de_retour": str(run_le)}


def main() -> None:
    print_banner("reconcile-rollback")
    rollback()


if __name__ == "__main__":
    main()
