"""verify_schema.py — VÉRIFIE (lecture seule) que la base porte ce que le code exige.

    MTJ_DATABASE_URL=… python -m mtj_model.pipeline.verify_schema

REMPLACE l'ancienne étape « migrer-base ». Celle-ci avait une liste de migrations
FIGÉE à 0011 : elle « réussissait » en étant quinze migrations en retard, sans que
personne ne le voie. Une étape qui migre à moitié MENT. On ne migre donc plus en CI
(les migrations s'appliquent à la main dans Supabase — voir README) : on VÉRIFIE.

N'ÉCRIT RIEN. Sort en code 1 (et imprime la liste) si :
  1. un objet du manifeste (colonne / table / fonction) manque en base — via
     `verifier_schema` (migration 0019), le MÊME moteur que l'app et health.py ;
  2. une table qui DOIT porter la RLS ne l'a pas (section 'rls' du manifeste).

POURQUOI la RLS est vérifiée ICI en direct (pg_class) et pas via `verifier_schema` :
le pipeline se connecte en direct (psycopg) et LIT le catalogue Postgres ; l'app, elle,
passe par PostgREST qui n'expose pas pg_class — d'où le moteur SQL pour les objets. La
RLS n'a pas besoin de ce détour côté pipeline. Une source de vérité unique quand même :
la liste attendue vient du manifeste, pas d'une constante parallèle. La 0016 a activé la
RLS sur 8 tables de référence ; sans elle, la clé publique peut les lire et les écrire
(empoisonner fixtures/teams/team_strength → faux « fragile », lire market_map).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import psycopg

from .db import connect


def _schema_manifest_path() -> Path:
    """packages/model/mtj_model/pipeline/verify_schema.py → packages/db/schema_manifest.json."""
    return Path(__file__).resolve().parents[3] / "db" / "schema_manifest.json"


def rls_attendues(manifest: dict) -> list[dict]:
    """Tables qui doivent porter la RLS, depuis la section 'rls' du manifeste. PURE."""
    return list(manifest.get("rls") or [])


def rls_manquantes(cur, attendues: list[dict]) -> list[tuple[str, str]]:
    """Parmi les tables attendues, celles ABSENTES ou SANS RLS active → (table, migration).

    Une table absente compte comme « RLS manquante » : soit la migration 0016 n'est pas
    passée, soit la table n'existe pas — les deux méritent le même refus explicite.
    """
    if not attendues:
        return []
    noms = [r["table"] for r in attendues]
    cur.execute(
        "select relname, relrowsecurity from pg_class c "
        "join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and relname = any(%s)",
        (noms,),
    )
    etat = {nom: bool(rls) for nom, rls in cur.fetchall()}
    return [(r["table"], r["migration"]) for r in attendues if not etat.get(r["table"], False)]


def verifier() -> list[str]:
    """Renvoie la liste des manques (vide = base alignée). Ne lève pas : agrège tout."""
    manques: list[str] = []
    manifest_txt = _schema_manifest_path().read_text(encoding="utf-8")
    manifest = json.loads(manifest_txt)

    with connect() as con, con.cursor() as cur:
        # 1) Objets du contrat — moteur partagé verifier_schema(manifest).
        try:
            cur.execute("select objet, migration from verifier_schema(%s::jsonb)", (manifest_txt,))
            for objet, migration in cur.fetchall():
                manques.append(f"Manquant : {objet} (migration {migration})")
        except psycopg.errors.UndefinedFunction:
            manques.append(
                "fonction verifier_schema (migration 0019) absente — vérification du "
                "décalage code/base IMPOSSIBLE. Applique 0019."
            )
            con.rollback()  # transaction avortée : ne pas contaminer le contrôle RLS

        # 2) RLS des tables de référence — introspection directe pg_class.
        for table, migration in rls_manquantes(cur, rls_attendues(manifest)):
            manques.append(f"RLS inactive : {table} (migration {migration}) — table de "
                           f"référence exposée à la clé publique.")
    return manques


def main() -> None:
    manques = verifier()
    attendues = rls_attendues(json.loads(_schema_manifest_path().read_text(encoding="utf-8")))
    if manques:
        print("SCHÉMA DÉCALÉ — la base n'a pas ce que le code exige :", file=sys.stderr)
        for m in manques:
            print("  - " + m, file=sys.stderr)
        print("\nApplique les migrations manquantes à la main dans Supabase, "
              "puis ouvre /api/health/schema pour confirmer.", file=sys.stderr)
        sys.exit(1)
    print(f"Schéma aligné : tous les objets du manifeste sont présents, "
          f"et les {len(attendues)} tables de référence portent la RLS.")


if __name__ == "__main__":
    main()
