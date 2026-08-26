"""
reconcile_dryrun.py — RAPPORT de réconciliation club_id, EN LECTURE SEULE.

N'écrit RIEN. Utilise EXACTEMENT le même regroupement que `reconcile` (club_grouping.
regrouper), donc ce rapport PRÉDIT l'écriture. À relire AVANT toute migration —
la relecture est le filet OBLIGATOIRE (elle a déjà attrapé la fusion Bayern H/F).

  SECTION 1 — DOUBLONS INTRA-CHAMPIONNAT MODÈLE (prioritaire) : deux entités d'un même
    club DANS un même championnat backtesté (E0, F1…) — historique coupé, force
    faussée. Doit être VIDE.

  SECTION 2 — REGROUPEMENTS SAINS : ce que la migration fusionnerait sous un club_id.

  SECTION 2 bis — FAUX REGROUPEMENTS ÉVITÉS (garde population) : même nom, mais que la
    signature (genre / sélection / pays) SÉPARE en clubs distincts. Nommés, pour
    vérifier qu'on n'exclut pas de VRAIS regroupements.

  SECTION 3 — CO-OCCURRENCE (garde BLOQUANT) : deux adversaires qui tomberaient sur la
    même clé → dissous, jamais fusionnés. Doit être VIDE.

  SECTION 4 — VOLUME : clubs regroupant le plus d'entités / de matchs (fusion abusive ?).
"""
from __future__ import annotations

from collections import defaultdict

from .club_grouping import population_signature, regrouper
from .db import connect
from .sync import club_key

MODEL_LEAGUES = {"E0", "F1", "SP1", "I1", "D1", "P1", "B1", "N1", "T1", "G1", "SC0"}


def main() -> None:
    with connect() as con, con.cursor() as cur:
        cur.execute(
            "select t.id, t.nom, l.provider_ref, coalesce(c.odds_api_key, l.provider_ref) "
            "  from teams t "
            "  left join leagues l on l.id = t.league_id "
            "  left join league_catalog c on c.fd_code = l.provider_ref"
        )
        rows = [(int(i), nom, pref, sk) for i, nom, pref, sk in cur.fetchall()]
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

    entities = [{"id": i, "nom": nom, "club_key": club_key(nom), "sig": population_signature(sk)}
                for i, nom, _, sk in rows]
    pref_by_id = {i: pref for i, _, pref, _ in rows}
    _club_of, rapport = regrouper(entities, pairs)

    # SECTION 1 — doublons intra-championnat modèle.
    intra: dict[tuple, list] = defaultdict(list)
    for e in entities:
        if pref_by_id[e["id"]] in MODEL_LEAGUES:
            intra[(pref_by_id[e["id"]], e["club_key"])].append((e["id"], e["nom"]))
    intra_dups = {k: v for k, v in intra.items() if len({t[0] for t in v}) > 1}
    print("=" * 70)
    print(f"SECTION 1 — DOUBLONS INTRA-CHAMPIONNAT MODÈLE : {len(intra_dups)} (doit être 0)")
    print("=" * 70)
    if not intra_dups:
        print("  ✓ AUCUN — les forces des 11 championnats modèle ne sont pas coupées en deux.")
    else:
        for (pref, k), v in sorted(intra_dups.items()):
            print(f"  ⛔ [{pref}] « {k} » → " + " · ".join(f"id{t} « {n} »" for t, n in v))

    # SECTION 2 — regroupements sains.
    print("\n" + "=" * 70)
    print(f"SECTION 2 — REGROUPEMENTS SAINS : {len(rapport['fusions'])} clubs")
    print("=" * 70)
    for f in sorted(rapport["fusions"], key=lambda x: x["cle"]):
        membres = " · ".join(f"id{m['id']} « {m['nom']} »" for m in f["membres"])
        print(f"  « {f['cle']} » → {membres}")

    # SECTION 2 bis — FAUX regroupements évités (le garde de population).
    print("\n" + "=" * 70)
    print(f"SECTION 2 bis — FAUX REGROUPEMENTS ÉVITÉS : {len(rapport['ecartes'])} "
          "(vérifie qu'aucun VRAI regroupement n'est ici)")
    print("=" * 70)
    if not rapport["ecartes"]:
        print("  (aucun)")
    for ec in sorted(rapport["ecartes"], key=lambda x: x["cle"]):
        print(f"  « {ec['cle']} » — SÉPARÉ ({ec['raison']}) :")
        for grp in ec["sous_clubs"]:
            g, n, p = grp[0]["sig"]
            tag = f"{'F' if g == 'F' else 'H'}{' · sélection' if n else ''}{' · ' + p if p else ''}"
            print(f"      [{tag}] " + " · ".join(f"id{m['id']} « {m['nom']} »" for m in grp))

    # SECTION 3 — co-occurrence.
    print("\n" + "=" * 70)
    print(f"SECTION 3 — COLLISIONS DE CO-OCCURRENCE : {len(rapport['cooccurrence'])} (doit être 0)")
    print("=" * 70)
    if not rapport["cooccurrence"]:
        print("  ✓ AUCUNE : aucun couple d'adversaires ne partage une clé.")
    else:
        for k in rapport["cooccurrence"]:
            print(f"  ⛔ « {k} » : deux adversaires — dissous (chacun son id).")

    # SECTION 4 — volume.
    print("\n" + "=" * 70)
    print("SECTION 4 — VOLUME : clubs regroupés, par nb d'entités puis de matchs")
    print("=" * 70)
    vol = sorted(
        ((f["cle"], len(f["membres"]), sum(matchs.get(m["id"], 0) for m in f["membres"]))
         for f in rapport["fusions"]),
        key=lambda x: (-x[1], -x[2]),
    )
    for k, n_ent, n_matchs in vol[:25]:
        flag = "  ⚠ à vérifier" if n_ent >= 4 else ""
        print(f"  « {k:<28} » {n_ent} entités · {n_matchs} matchs{flag}")

    print(f"\nRIEN n'a été écrit. RÉSUMÉ : {len(rapport['fusions'])} regroupements sains, "
          f"{len(rapport['ecartes'])} faux regroupements évités, "
          f"{len(rapport['cooccurrence'])} co-occurrences dissoutes.")
    print("Relis les sections 1 et 3 (doivent être vides) et la 2 bis (aucun vrai club).")


if __name__ == "__main__":
    main()
