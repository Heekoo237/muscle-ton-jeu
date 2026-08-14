"""
reconcile_dryrun.py — RAPPORT de réconciliation club_id, EN LECTURE SEULE.

N'écrit RIEN. Produit ce qu'il faut relire AVANT toute migration :

  SECTION 1 — DOUBLONS INTRA-CHAMPIONNAT MODÈLE (le point prioritaire) : deux
    entités d'un même club DANS un même championnat backtesté (E0, F1, …). Ça, ce
    n'est PAS le doublon inter-compétitions bénin — c'est un historique coupé en
    deux et une force d'équipe FAUSSE. Doit être vide ; sinon, liste.

  SECTION 2 — REGROUPEMENTS PROPOSÉS : club → entités → clé. Ce que la migration
    fusionnerait sous un club_id commun. À relire comme la carte d'alias.

  SECTION 3 — CO-OCCURRENCE (garde-fou BLOQUANT) : deux adversaires d'un même match
    qui tomberaient sur la même clé. INTERDIT — ces groupes sont refusés, jamais
    fusionnés. Doit être vide.

  SECTION 4 — VOLUME : clubs regroupant le plus d'entités / de matchs, pour repérer
    à l'œil une fusion abusive (second garde-fou du backfill).

Clé de club = clé canonique (normalize_team_name, retire déjà fc/cf/sc/de/…) +
expansion d'abréviations (st→saint) + retrait d'affixes de club (stade, usl, …).
C'est le mécanisme sensible : la SECTION 3 est là pour l'attraper s'il fusionne
trop. Affixes/expansions surchargeables : MTJ_AFFIXES=… MTJ_EXPAND=st:saint,…
"""
from __future__ import annotations

import os
from collections import defaultdict

from .db import connect
from .sync import normalize_team_name

MODEL_LEAGUES = {"E0", "F1", "SP1", "I1", "D1", "P1", "B1", "N1", "T1", "G1", "SC0"}

# Affixes de club à retirer EN PLUS du bruit déjà géré par normalize_team_name.
DEFAULT_AFFIXES = {"stade", "olympique", "racing", "us", "usl", "cs", "sk", "jk",
                   "fk", "ks", "nk", "calcio", "ssd", "ssc", "asd"}
DEFAULT_EXPAND = {"st": "saint"}


def _affixes() -> set[str]:
    raw = os.environ.get("MTJ_AFFIXES", "").strip()
    return {x.strip().lower() for x in raw.split(",") if x.strip()} if raw else DEFAULT_AFFIXES


def _expand() -> dict[str, str]:
    raw = os.environ.get("MTJ_EXPAND", "").strip()
    if not raw:
        return DEFAULT_EXPAND
    out = {}
    for pair in raw.split(","):
        if ":" in pair:
            k, v = pair.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def club_key(nom: str, affixes: set[str], expand: dict[str, str]) -> str:
    base = normalize_team_name(nom)  # retire déjà le bruit (fc, cf, de, club…)
    toks = [expand.get(t, t) for t in base.split()]
    toks = [t for t in toks if t not in affixes]
    return " ".join(toks) or base  # jamais vide : repli sur la clé canonique


def main() -> None:
    affixes, expand = _affixes(), _expand()
    with connect() as con, con.cursor() as cur:
        cur.execute(
            "select t.id, t.nom, l.provider_ref from teams t join leagues l on l.id = t.league_id"
        )
        teams = [(int(i), nom, pref) for i, nom, pref in cur.fetchall()]
        cur.execute("select team_home_id, team_away_id from fixtures")
        pairs = [(int(h), int(a)) for h, a in cur.fetchall() if h and a]
        cur.execute(
            """select team_home_id, count(*) from fixtures group by team_home_id
               union all select team_away_id, count(*) from fixtures group by team_away_id"""
        )
        matchs = defaultdict(int)
        for tid, n in cur.fetchall():
            if tid is not None:
                matchs[int(tid)] += int(n)

    nom_by_id = {tid: nom for tid, nom, _ in teams}
    key_by_id = {tid: club_key(nom, affixes, expand) for tid, nom, _ in teams}
    print(f"Affixes retirés : {', '.join(sorted(affixes))}")
    print(f"Expansions : {expand}\n")

    # SECTION 1 — doublons intra-championnat modèle (PRIORITAIRE).
    intra: dict[tuple, list] = defaultdict(list)
    for tid, nom, pref in teams:
        if pref in MODEL_LEAGUES:
            intra[(pref, key_by_id[tid])].append((tid, nom))
    intra_dups = {k: v for k, v in intra.items() if len({t[0] for t in v}) > 1}
    print("=" * 70)
    print(f"SECTION 1 — DOUBLONS INTRA-CHAMPIONNAT MODÈLE : {len(intra_dups)} (doit être 0)")
    print("=" * 70)
    if not intra_dups:
        print("  ✓ AUCUN. Les forces d'équipe des 11 championnats modèle ne sont PAS")
        print("    coupées en deux — pas de bug de modèle de ce côté.")
    else:
        print("  ⛔ BUG DE MODÈLE — historique coupé, force faussée. À corriger en priorité :")
        for (pref, k), v in sorted(intra_dups.items()):
            print(f"    [{pref}] « {k} » → " + " · ".join(f"id{t} « {n} »" for t, n in v))

    # SECTION 2 — regroupements proposés (toutes ligues), club_key multi-entités.
    groups: dict[str, list] = defaultdict(list)
    for tid, nom, pref in teams:
        groups[key_by_id[tid]].append((tid, nom, pref))
    multi = {k: v for k, v in groups.items() if len({t[0] for t in v}) > 1}
    print("\n" + "=" * 70)
    print(f"SECTION 2 — REGROUPEMENTS PROPOSÉS : {len(multi)} clubs (relis avant écriture)")
    print("=" * 70)
    for k, v in sorted(multi.items()):
        print(f"  « {k} » → " + " · ".join(f"id{t} « {n} » [{p}]" for t, n, p in v))

    # SECTION 3 — co-occurrence bloquante.
    collisions = {}
    for h, a in pairs:
        kh, ka = key_by_id.get(h), key_by_id.get(a)
        if kh and kh == ka:
            collisions[(kh, min(h, a), max(h, a))] = (nom_by_id.get(h), nom_by_id.get(a))
    print("\n" + "=" * 70)
    print(f"SECTION 3 — COLLISIONS DE CO-OCCURRENCE : {len(collisions)} (doit être 0)")
    print("=" * 70)
    if not collisions:
        print("  ✓ AUCUNE : aucun couple d'adversaires ne partage une clé.")
    else:
        print("  ⛔ REFUSÉ — ces groupes fusionneraient deux clubs adversaires :")
        for (k, _, _), (nh, na) in collisions.items():
            print(f"    « {k} » : « {nh} » vs « {na} »")

    # SECTION 4 — volume (fusion abusive ?).
    print("\n" + "=" * 70)
    print("SECTION 4 — VOLUME : clubs regroupés, par nb d'entités puis de matchs")
    print("=" * 70)
    vol = sorted(
        ((k, len({t[0] for t in v}), sum(matchs.get(t[0], 0) for t in v)) for k, v in multi.items()),
        key=lambda x: (-x[1], -x[2]),
    )
    for k, n_ent, n_matchs in vol[:25]:
        flag = "  ⚠ à vérifier" if n_ent >= 4 else ""
        print(f"  « {k:<28} » {n_ent} entités · {n_matchs} matchs{flag}")

    print("\nRIEN n'a été écrit. Relis les sections 1 et 3 en priorité : elles doivent")
    print("être vides. La migration club_id n'appliquera que la section 2, MOINS toute")
    print("collision de la section 3, et signalera les volumes anormaux de la section 4.")


if __name__ == "__main__":
    main()
