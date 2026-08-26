"""redress_orientation.py — Redressement UNIQUE des fixtures à l'orientation retournée.

CONTEXTE (health.py, alerte « orientation »). La double chance MODÈLE et le 1X2
COTÉ désignent des favoris OPPOSÉS (écart ≥ 0,25) : le fixture home/away est posé
à l'envers des cotes — le symptôme « favori affiché perdant » (cas Rennes–PSG).

POURQUOI LE DÉGEL NE SUFFIT PAS. `sync.upsert_fixture` a été dégelé : à chaque
relevé, un fixture re-collecté reprend l'orientation du fournisseur. Mais le lot
DÉJÀ retourné ne se solde pas tout seul : ces matchs ne repassent pas tous dans le
flux de cotes de leur championnat (coupes inter-divisions, matchs de bord de
fenêtre, fixtures nés du chemin à la demande). Le collecteur ne les ré-oriente donc
jamais, et leur double chance modèle reste calculée sur une orientation périmée,
opposée à celle du dernier relevé de cotes. C'est une DETTE, à solder une fois.

DEUX MODES, comme le backfill du règlement :

  - dry-run (DÉFAUT) : LECTURE seule. Pour chaque fixture retourné, l'AVANT/APRÈS
    et la cause exacte (orientation en base vs orientation du fournisseur au dernier
    relevé). N'écrit RIEN. C'est l'étape « comprendre avant de solder ».

  - --apply : ré-ancre team_home/away sur le DERNIER RELEVÉ du fournisseur
    (`home_team` réel — pas une supposition), efface les predictions périmées du
    fixture (le collecteur + le nocturne les réécrivent propre, orientation cohérente),
    et JOURNALISE chaque fixture avec avant/après.

DÉTERMINISTE, IDEMPOTENT, relançable sans risque. Aucun nombre inventé (règle d'or
n°1) : on lit le `home_team` du fournisseur et on aligne. On ne calcule aucune proba
ici ; on efface les périmées, une écriture déterministe (collecteur/nocturne) les
refait. La cote n'entre dans aucun calcul — elle sert au seul recoupement, comme
l'œil du joueur sur son ticket.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass

from .db import connect
from .provider import NullProvider, get_provider
from .sync import league_worklist, normalize_team_name
from .version import print_banner

# MÊME seuil que health.py (_orientation_flip) et coherenceStore (SEUIL_FLIP_DC) : on
# redresse EXACTEMENT ce que la surveillance signale, jamais un lot différent.
SEUIL_FLIP = 0.25
# MÊME fenêtre que la surveillance : -7 j (matchs récents) / +14 j (à venir couverts).
FENETRE_AVANT_J = 14
FENETRE_APRES_J = 7


@dataclass
class FixtureRetourne:
    fixture_id: int
    provider_ref: str | None
    league_id: int
    date_utc: str
    home_id: int
    away_id: int
    home_nom: str
    away_nom: str
    wh: float
    dr: float
    dc: float

    @property
    def ecart(self) -> float:
        return round(self.dc - (self.wh + self.dr), 3)


def fixtures_retournes(con) -> list[FixtureRetourne]:
    """Les fixtures dont la DC modèle contredit le 1X2 coté (≥ SEUIL), en fenêtre.

    Reprend TRAIT POUR TRAIT la requête de `health.py._orientation_flip` (dernier
    relevé par marché, DC de source 'model'), en remontant les colonnes utiles au
    redressement au lieu du seul compte. Un écart ici = une orientation à l'envers."""
    sql = """
        with latest as (
            select distinct on (fixture_id, marche)
                   fixture_id, marche, probabilite, source
              from predictions
             where marche in ('WIN_HOME','DRAW','DC_HOME_DRAW')
             order by fixture_id, marche, jour_calcul desc
        ),
        piv as (
            select fixture_id,
                   max(probabilite) filter (where marche='WIN_HOME')      as wh,
                   max(probabilite) filter (where marche='DRAW')          as dr,
                   max(probabilite) filter (where marche='DC_HOME_DRAW')  as dc,
                   max(source::text) filter (where marche='DC_HOME_DRAW') as dc_src
              from latest group by fixture_id
        )
        select f.id, f.provider_ref, f.league_id, f.date_utc,
               f.team_home_id, th.nom, f.team_away_id, ta.nom,
               piv.wh, piv.dr, piv.dc
          from piv
          join fixtures f on f.id = piv.fixture_id
          join teams    th on th.id = f.team_home_id
          join teams    ta on ta.id = f.team_away_id
         where f.date_utc between now() - interval '%s days' and now() + interval '%s days'
           and piv.dc_src = 'model'
           and piv.wh is not null and piv.dr is not null and piv.dc is not null
           and abs(piv.dc - (piv.wh + piv.dr)) >= %s
         order by f.date_utc
    """
    with con.cursor() as cur:
        cur.execute(sql, (FENETRE_APRES_J, FENETRE_AVANT_J, SEUIL_FLIP))
        out = []
        for r in cur.fetchall():
            out.append(FixtureRetourne(
                fixture_id=int(r[0]), provider_ref=r[1], league_id=int(r[2]),
                date_utc=str(r[3]), home_id=int(r[4]), home_nom=r[5],
                away_id=int(r[6]), away_nom=r[7],
                wh=float(r[8]), dr=float(r[9]), dc=float(r[10]),
            ))
        return out


def _sport_keys_par_ligue(con, league_ids: set[int]) -> dict[int, str]:
    """league_id → clé fournisseur (odds_api_key), pour re-relever le bon championnat."""
    if not league_ids:
        return {}
    par_ligue: dict[int, str] = {}
    for lg in league_worklist(con):
        if lg["league_id"] in league_ids:
            par_ligue[lg["league_id"]] = lg["odds_api_key"]
    return par_ligue


def _orientation_fournisseur(provider, sport_keys: dict[int, str],
                             fixtures: list[FixtureRetourne]) -> dict[str, tuple[str, str]]:
    """provider_ref → (home_team, away_team) du DERNIER relevé, par championnat.

    Un relevé groupé par championnat (comme le collecteur) : coût borné (≈ 2 crédits
    par championnat concerné), aucun appel par match. Un championnat qui lève n'empêche
    pas les autres (le fournisseur reste isolé — règle d'archi n°4)."""
    besoins = {sport_keys[f.league_id] for f in fixtures if f.league_id in sport_keys}
    carte: dict[str, tuple[str, str]] = {}
    for sport in sorted(besoins):
        try:
            for o in provider.odds(sport, days_ahead=FENETRE_AVANT_J):
                carte.setdefault(o.fixture_ref, (o.home, o.away))
        except Exception as exc:  # noqa: BLE001 — un championnat qui lève n'arrête pas le job
            print(f"  ⚠ relevé {sport} ignoré ({type(exc).__name__}: {exc})")
    return carte


@dataclass
class Decision:
    fx: FixtureRetourne
    kind: str          # 'reoriente' | 'deja_aligne' | 'non_reancrable' | 'noms_divergent'
    home_cible: str | None = None
    away_cible: str | None = None


def decider(fx: FixtureRetourne, carte: dict[str, tuple[str, str]]) -> Decision:
    """Décision PURE (testable sans base ni fournisseur) pour UN fixture.

    On compare l'orientation en base au `home_team` du fournisseur :
      - fixture absent du dernier relevé → `non_reancrable` (le fournisseur ne le
        porte plus ; on ne devine pas, on le dit) ;
      - `home_team` = équipe stockée en DOMICILE → `deja_aligne` (l'orientation est
        bonne ; c'est la DC modèle qui est périmée → on efface, le nocturne refait) ;
      - `home_team` = équipe stockée en EXTÉRIEUR → `reoriente` (on inverse
        team_home/away, puis on efface les predictions) ;
      - aucun des deux noms ne correspond → `noms_divergent` (alias : NOTRE lacune,
        pas une orientation ; on ne touche à rien, on le signale)."""
    if not fx.provider_ref or fx.provider_ref not in carte:
        return Decision(fx, "non_reancrable")
    prov_home, prov_away = carte[fx.provider_ref]
    ph, pa = normalize_team_name(prov_home), normalize_team_name(prov_away)
    cur_home, cur_away = normalize_team_name(fx.home_nom), normalize_team_name(fx.away_nom)
    if ph == cur_home and pa == cur_away:
        return Decision(fx, "deja_aligne", prov_home, prov_away)
    if ph == cur_away and pa == cur_home:
        return Decision(fx, "reoriente", prov_home, prov_away)
    return Decision(fx, "noms_divergent", prov_home, prov_away)


def _appliquer(con, d: Decision) -> None:
    """Écrit UNE décision. 'reoriente' inverse team_home/away ; les deux cas qui
    touchent l'orientation OU la stale effacent les predictions du fixture (le
    collecteur/nocturne les réécrivent, orientation cohérente). Transaction par
    fixture : ce qui échoue est annulé seul."""
    with con.transaction(), con.cursor() as cur:
        if d.kind == "reoriente":
            cur.execute(
                "update fixtures set team_home_id = %s, team_away_id = %s where id = %s",
                (d.fx.away_id, d.fx.home_id, d.fx.fixture_id),
            )
        if d.kind in ("reoriente", "deja_aligne"):
            cur.execute("delete from predictions where fixture_id = %s", (d.fx.fixture_id,))


def _ligne_journal(d: Decision) -> str:
    fx = d.fx
    avant = f"{fx.home_nom} (dom) – {fx.away_nom} (ext)"
    if d.kind == "reoriente":
        apres = f"{d.home_cible} (dom) – {d.away_cible} (ext)  [INVERSÉ, predictions effacées]"
    elif d.kind == "deja_aligne":
        apres = "orientation OK, DC modèle périmée → predictions effacées (nocturne refait)"
    elif d.kind == "non_reancrable":
        apres = "fournisseur ne porte plus ce match au dernier relevé → NON redressé"
    else:  # noms_divergent
        apres = (f"noms fournisseur « {d.home_cible} / {d.away_cible} » ≠ base → "
                 "alias à corriger, orientation NON touchée")
    return (f"  fixture {fx.fixture_id} [{fx.date_utc[:16]}]  écart {fx.ecart:+.2f}\n"
            f"      avant : {avant}\n"
            f"      après : {apres}")


def redresser(apply: bool) -> dict:
    """Point d'entrée. dry-run par défaut (n'écrit rien). Renvoie le compte par cas."""
    provider = get_provider()
    if isinstance(provider, NullProvider):
        raise SystemExit("redress_orientation : fournisseur non branché "
                         "(MTJ_PROVIDER/MTJ_PROVIDER_KEY) — le ré-ancrage lit le dernier relevé.")
    compte: dict[str, int] = {"reoriente": 0, "deja_aligne": 0,
                              "non_reancrable": 0, "noms_divergent": 0}
    with connect() as con:
        fixtures = fixtures_retournes(con)
        if not fixtures:
            print("Aucun fixture retourné en fenêtre — rien à redresser.")
            return compte
        sport_keys = _sport_keys_par_ligue(con, {f.league_id for f in fixtures})
        carte = _orientation_fournisseur(provider, sport_keys, fixtures)
        mode = "APPLIQUÉ (écrit)" if apply else "DRY-RUN (lecture seule, rien écrit)"
        print(f"\n{len(fixtures)} fixture(s) retourné(s) — {mode} :\n")
        for fx in fixtures:
            d = decider(fx, carte)
            compte[d.kind] += 1
            print(_ligne_journal(d))
            if apply and d.kind in ("reoriente", "deja_aligne"):
                _appliquer(con, d)
    credits = getattr(provider, "credits_used", None)
    print(f"\nRécapitulatif : {compte['reoriente']} réorientés · "
          f"{compte['deja_aligne']} DC périmée effacée · "
          f"{compte['non_reancrable']} non ré-ancrables · "
          f"{compte['noms_divergent']} noms divergents"
          + (f"  ·  crédits fournisseur : {credits}" if credits is not None else ""))
    if not apply:
        print("\nDRY-RUN : aucune écriture. Relance avec --apply pour solder, "
              "après avoir lu l'avant/après ci-dessus.")
    elif compte["non_reancrable"] or compte["noms_divergent"]:
        print("\nRESTE : les 'non ré-ancrables' (fournisseur ne les porte plus) et les "
              "'noms divergents' (alias) ne sont PAS redressés — ils demandent une décision "
              "à part (fix structurel d'orientation, ou carte d'alias).")
    return compte


def main() -> None:
    print_banner("redress-orientation")
    ap = argparse.ArgumentParser(description="Redressement unique des fixtures retournés.")
    ap.add_argument("--apply", action="store_true",
                    help="Écrit (réoriente + efface les predictions périmées). Sans lui : dry-run.")
    args = ap.parse_args()
    redresser(apply=args.apply)
    # Action MANUELLE (workflow_dispatch) : on ne sort jamais en erreur — un dry-run
    # de lecture ne doit pas peindre le job en rouge. La SURVEILLANCE (health.py), elle,
    # continue d'alerter tant que le compte 'orientation' n'est pas retombé.


if __name__ == "__main__":
    main()
