"""
neutralize_dryrun.py — SIMULE (sans rien appliquer) la neutralisation de préfixes
et suffixes de club, et RÉPOND aux deux questions avant toute décision :
  1. combien d'équipes fusionneraient (partageraient une clé neutralisée) ?
  2. y a-t-il des COLLISIONS de co-occurrence — deux équipes qui jouent l'un contre
     l'autre et tombent sur la MÊME clé ? C'est le mécanisme qui a produit
     « Club Brugge = Cercle Brugge » : il ne doit JAMAIS arriver.

Lecture seule. N'écrit rien, ne change aucune clé en base. À lire AVANT de décider
si on neutralise dans la normalisation ou si on garde des alias curés.

Affixes candidats surchargeables : MTJ_AFFIXES="stade,olympique,usl,fc,sc,cf,as,rc".
"""
from __future__ import annotations

import os
import re
import unicodedata
from collections import defaultdict

from .db import connect

# Préfixes/suffixes de club à neutraliser (candidats). Volontairement large pour
# VOIR les dégâts : c'est un test, pas une application.
DEFAULT_AFFIXES = {
    "stade", "olympique", "racing", "sporting", "athletic", "atletico",
    "us", "usl", "as", "rc", "sc", "cs", "fc", "cf", "ac", "sk", "jk", "if", "bk",
    "cd", "ud", "sv", "club", "de", "of", "the", "fk", "ks", "nk",
}


def _affixes() -> set[str]:
    raw = os.environ.get("MTJ_AFFIXES", "").strip()
    return {x.strip().lower() for x in raw.split(",") if x.strip()} if raw else DEFAULT_AFFIXES


def _base_norm(nom: str) -> str:
    s = unicodedata.normalize("NFD", nom.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]", " ", s)


def neutral_key(nom: str, affixes: set[str]) -> str:
    """Clé après retrait des affixes (n'importe où dans le nom)."""
    toks = [t for t in _base_norm(nom).split() if t and t not in affixes]
    return " ".join(toks)


def main() -> None:
    affixes = _affixes()
    print(f"Affixes neutralisés ({len(affixes)}) : {', '.join(sorted(affixes))}\n")
    with connect() as con, con.cursor() as cur:
        cur.execute("select id, nom from teams")
        teams = {int(i): nom for i, nom in cur.fetchall()}
        cur.execute(
            """select th.nom, ta.nom
                 from fixtures f
                 join teams th on th.id = f.team_home_id
                 join teams ta on ta.id = f.team_away_id"""
        )
        pairs = cur.fetchall()

    # 1. Fusions : équipes partageant une clé neutralisée.
    by_key: dict[str, list[str]] = defaultdict(list)
    for nom in teams.values():
        by_key[neutral_key(nom, affixes)].append(nom)
    fusions = {k: v for k, v in by_key.items() if len(v) > 1}
    n_fusionnees = sum(len(v) for v in fusions.values())
    print(f"=== FUSIONS : {n_fusionnees} équipes tomberaient dans {len(fusions)} clés partagées ===")
    for k, noms in sorted(fusions.items(), key=lambda kv: -len(kv[1]))[:40]:
        print(f"  « {k or '(vide)'} » ← {', '.join(sorted(noms))}")
    if not fusions:
        print("  (aucune fusion)")

    # 2. Collisions de co-occurrence : deux adversaires → même clé. INTERDIT.
    collisions = []
    seen = set()
    for h, a in pairs:
        kh, ka = neutral_key(h, affixes), neutral_key(a, affixes)
        if kh == ka and (h, a) not in seen:
            seen.add((h, a))
            collisions.append((h, a, kh))
    print(f"\n=== COLLISIONS DE CO-OCCURRENCE : {len(collisions)} (doivent être ZÉRO) ===")
    for h, a, k in collisions:
        print(f"  ⛔ « {h} » vs « {a} » → même clé « {k} »")
    if not collisions:
        print("  ✓ aucune : aucun couple d'adversaires ne fusionne (mais vérifie les fusions ci-dessus).")

    print("\nVERDICT : une clé vide, une fusion de deux clubs distincts, ou une seule")
    print("collision = on NE neutralise PAS ce jeu d'affixes. Les alias curés restent")
    print("plus sûrs — on n'ajoute que ce que les logs prouvent nécessaire.")


if __name__ == "__main__":
    main()
