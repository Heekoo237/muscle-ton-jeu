"""club_grouping.py — Regroupement des entités d'un même CLUB RÉEL sous un club_id.

RÈGLE GÉNÉRALE (le principe, pas une liste de cas) :

    Deux entités ne fusionnent que si UN MÊME CLUB RÉEL pourrait jouer dans les deux
    compétitions.

Le garde de co-occurrence (« deux adversaires d'un même match ne partagent jamais une
clé ») est NÉCESSAIRE mais PAS SUFFISANT : il répond à « sont-ils adversaires », pas à
« sont-ils le même club ». Deux entités qui ne se rencontrent JAMAIS peuvent quand même
être des clubs différents. Trois cas mesurés sur le vrai catalogue :

  - Bayern masculin [Bundesliga] vs Bayern féminin [Bundesliga Women] ;
  - Andorre sélection [Nations League] vs Andorra CF club [Segunda] ;
  - Vitória [Brésil] vs Vitória SC [Portugal] — même nom, clubs différents.

Aucun ne se rencontre → la co-occurrence est aveugle. On ajoute donc une SIGNATURE DE
POPULATION par compétition, et deux signatures incompatibles ⇒ clubs différents :

    signature = (genre, sélection-nationale ?, pays domestique)

  - genre différent (H/F)         → clubs différents ;
  - sélection nationale vs club    → clubs différents ;
  - deux pays DOMESTIQUES différents → clubs différents (un club a un seul pays ;
    les coupes continentales/internationales n'ont pas de pays → compatibles avec
    n'importe lequel).

⚠️ PART MOTS-CLÉS À MAINTENIR (dit clairement, noté au README). Le genre et le type
« sélection nationale » se détectent par MOTIFS sur la clé fournisseur : le fournisseur
n'expose pas d'attribut structuré. `GENRE_FEMININ`, `MARQUEURS_SELECTION` et
`PAYS_CONNUS` sont donc des listes à COMPLÉTER quand le fournisseur ajoute des
compétitions. Conséquence des manques, à connaître :
  - un genre féminin NON détecté fusionnerait à tort (DANGEREUX) ;
  - un pays NON reconnu → « pas de pays » → au pire un regroupement manqué (bénin).
La RELECTURE du dry-run avant toute écriture reste le filet OBLIGATOIRE (elle a déjà
attrapé la fusion Bayern H/F) : un garde qui vérifie une condition ne prouve pas
l'absence d'erreur.
"""
from __future__ import annotations

from collections import defaultdict

# ── Détection par motifs (listes À MAINTENIR — voir l'avertissement ci-dessus) ──
GENRE_FEMININ = ("women", "womens", "feminine", "feminin", "frauen", "dames")
# Compétitions de SÉLECTIONS NATIONALES (jamais un club). Un marqueur suffit, SAUF si
# la clé dit « club » (ex. « fifa_club_world_cup » est un tournoi de CLUBS).
MARQUEURS_SELECTION = (
    "nations_league", "world_cup", "european_championship", "_euro_", "copa_america",
    "africa_cup_of_nations", "afcon", "asian_cup", "gold_cup", "concacaf_nations",
    "international_friendlies", "_qualifiers",
)
# Pays domestiques tels qu'ils apparaissent dans la clé The Odds API
# (« soccer_<pays>_<division> »). Une confédération (uefa, conmebol…) N'EST PAS un pays
# → « pas de pays domestique ». Un jeton absent de cette liste → « pas de pays » (bénin).
PAYS_CONNUS = frozenset({
    "england", "spain", "italy", "germany", "france", "portugal", "netherlands",
    "belgium", "turkey", "greece", "scotland", "denmark", "sweden", "norway", "austria",
    "switzerland", "poland", "russia", "ukraine", "croatia", "serbia", "romania",
    "brazil", "argentina", "chile", "mexico", "usa", "colombia", "uruguay", "paraguay",
    "peru", "ecuador", "bolivia", "venezuela", "japan", "korea", "china", "australia",
    "saudi", "egypt", "morocco", "algeria", "tunisia", "nigeria", "ireland", "wales",
    "finland", "iceland", "israel", "czech", "slovakia", "slovenia", "bulgaria",
    "hungary", "cyprus", "malta",
})


def population_signature(sport_key: str | None) -> tuple[str, bool, str | None]:
    """(genre, sélection_nationale, pays_domestique) d'une compétition, depuis sa clé
    fournisseur. PURE. `genre` ∈ {'H','F'} ; `pays` = code pays ou None (international)."""
    k = (sport_key or "").lower()
    genre = "F" if any(m in k for m in GENRE_FEMININ) else "H"
    nationale = ("club" not in k) and any(m in k for m in MARQUEURS_SELECTION)
    toks = k.split("_")
    pays = toks[1] if len(toks) > 1 and toks[1] in PAYS_CONNUS else None
    return genre, nationale, pays


def _raison_incompatible(sigs: list[tuple[str, bool, str | None]]) -> str:
    """Pourquoi un même club_key donne PLUSIEURS clubs (pour le rapport)."""
    causes = []
    if len({s[0] for s in sigs}) > 1:
        causes.append("genre H/F")
    if len({s[1] for s in sigs}) > 1:
        causes.append("sélection nationale vs club")
    pays = {s[2] for s in sigs if s[2] is not None}
    if len(pays) > 1:
        causes.append("pays domestiques différents (" + ", ".join(sorted(pays)) + ")")
    return " ; ".join(causes) or "co-occurrence"


def _sous_clubs(membres: list[dict]) -> list[list[dict]]:
    """Partitionne des entités de MÊME club_key en clubs RÉELS distincts par la
    signature de population. Chaque entité = dict {id, sig=(genre,nat,pays)}."""
    par_gn: dict[tuple, list[dict]] = defaultdict(list)
    for e in membres:
        g, n, _ = e["sig"]
        par_gn[(g, n)].append(e)
    out: list[list[dict]] = []
    for grp in par_gn.values():
        pays = {e["sig"][2] for e in grp if e["sig"][2] is not None}
        if len(pays) <= 1:
            out.append(grp)  # un seul (ou zéro) pays → un seul club, coupes incluses
        else:
            # Homonymes de pays différents : on scinde par pays. Une entité SANS pays
            # (internationale) est ambiguë entre deux pays → elle garde son id propre.
            par_pays: dict[object, list[dict]] = defaultdict(list)
            for e in grp:
                par_pays[e["sig"][2] if e["sig"][2] else ("_ambigu_", e["id"])].append(e)
            out.extend(par_pays.values())
    return out


def regrouper(entities: list[dict], pairs: list[tuple[int, int]]) -> tuple[dict[int, int], dict]:
    """entities : [{id, nom, club_key, sig}]. pairs : (home_id, away_id) des fixtures.

    Renvoie (club_of, rapport). `club_of` = team_id → club_id (plus petit id du club
    réel). `rapport` = {fusions, ecartes, cooccurrence} pour le dry-run :
      - fusions   : club_key regroupant plusieurs entités en UN club ;
      - ecartes   : club_key qu'un même nom réunit mais que la signature SÉPARE en
                    plusieurs clubs (les faux regroupements évités), avec la raison ;
      - cooccurrence : clubs dissous parce qu'ils contenaient deux adversaires."""
    par_ck: dict[str, list[dict]] = defaultdict(list)
    for e in entities:
        par_ck[e["club_key"]].append(e)

    club_of: dict[int, int] = {}
    fusions: list[dict] = []
    ecartes: list[dict] = []
    for ck, membres in par_ck.items():
        sous = _sous_clubs(membres)
        for grp in sous:
            cid = min(e["id"] for e in grp)
            for e in grp:
                club_of[e["id"]] = cid
        distinct_ids = {e["id"] for e in membres}
        if len(distinct_ids) > 1:
            if len(sous) == 1:
                fusions.append({"cle": ck, "membres": membres})
            else:
                ecartes.append({
                    "cle": ck,
                    "raison": _raison_incompatible([e["sig"] for e in membres]),
                    "sous_clubs": sous,
                })

    # GARDE CO-OCCURRENCE (dernier filet) : un club qui contiendrait deux adversaires
    # d'un même match est dissous — chaque entité reprend son id propre.
    colliding: set[int] = set()
    for h, a in pairs:
        if h != a and club_of.get(h) is not None and club_of.get(h) == club_of.get(a):
            colliding.add(club_of[h])
    cooccurrence: list[int] = sorted(colliding)
    if colliding:
        nom_de = {e["id"]: e for e in entities}
        for tid, cid in list(club_of.items()):
            if cid in colliding:
                club_of[tid] = tid  # dissout : id propre
        cooccurrence = [nom_de[c]["club_key"] for c in colliding if c in nom_de]

    return club_of, {"fusions": fusions, "ecartes": ecartes, "cooccurrence": cooccurrence}
