"""
catalogue_sync.py — SYNCHRONISE le catalogue du fournisseur avec notre base.

    MTJ_DATABASE_URL=… MTJ_PROVIDER=oddsapi MTJ_PROVIDER_KEY=… \
        python -m mtj_model.pipeline.catalogue_sync

Appel /sports (GRATUIT, 0 crédit). Idempotent, lecture du fournisseur + écritures
bornées en base. Son rôle : que les compétitions s'activent et se désactivent
TOUTES SEULES, sans intervention.

- Une compétition ACTIVE chez le fournisseur et absente de la base → créée en
  régime COTE SEULE (1 relevé/j), `leagues.actif = true`.
- Une compétition déjà connue qui redevient active (CAN, Ligue des Champions… en
  début de saison) → `leagues.actif = true`. C'est l'auto-activation demandée.
- Une compétition qui n'est plus active (fin de saison) → `leagues.actif = false`.
  On NE SUPPRIME jamais : l'historique reste, la compétition repartira à la
  prochaine saison.

Ce que la synchro NE fait PAS : promouvoir une compétition au régime modèle. Ça,
c'est l'onboarding manuel (alias + co-occurrence + volume + backtest ECE). Une
compétition backtestée (les 11) garde son fd_code et son régime : la synchro ne
les écrase pas, elle les reconnaît par leur clé The Odds API.
"""
from __future__ import annotations

from .catalogue import classify
from .db import connect
from .provider import NullProvider, get_provider
from .version import print_banner


# Indices LARGES de compétition FÉMININE ou de SÉLECTION NATIONALE. Sert à ALERTER
# quand une NOUVELLE compétition arrive : le garde de réconciliation (club_grouping)
# sépare H/F et sélection/club par des MOTIFS ; si le fournisseur ajoute une compétition
# avec une graphie non prévue (ex. une Liga féminine, une Women's Super League), il faut
# le VÉRIFIER avant la prochaine réconciliation — sinon on risque de re-fusionner une
# équipe féminine avec son homologue masculine. Plus large que les motifs du garde
# EXPRÈS : ici, mieux vaut une alerte de trop qu'un angle mort.
INDICES_A_VERIFIER = (
    "women", "womens", "woman", "femin", "fémin", "frauen", "dames", "ladies", "nwsl",
    "feminine", "w_league", "w-league",
    "nations_league", "nations", "world_cup", "european_championship", "copa_america",
    "africa_cup", "afcon", "asian_cup", "gold_cup", "friendlies", "friendly",
)


def competitions_a_verifier(inserts: list[str], titre_par_cle: dict[str, str]) -> list[str]:
    """Parmi les compétitions NOUVELLES, celles dont la clé/le titre suggère féminin ou
    sélection nationale → à confronter aux listes de `club_grouping`. PURE (testable)."""
    out = []
    for k in inserts:
        blob = (k + " " + (titre_par_cle.get(k) or "")).lower()
        if any(h in blob for h in INDICES_A_VERIFIER):
            out.append(k)
    return out


def plan_sync(active_keys: set[str], existing: dict[str, str]) -> dict[str, list[str]]:
    """Décision PURE (testable sans base). `existing` = clé The Odds API → fd_code
    déjà en base. Renvoie ce qu'il faut insérer (nouvelles), activer (connues et
    actives) et désactiver (connues mais plus actives)."""
    to_insert = sorted(k for k in active_keys if k not in existing)
    to_activate = sorted(existing[k] for k in active_keys if k in existing)
    to_deactivate = sorted(fd for k, fd in existing.items() if k not in active_keys)
    return {"insert": to_insert, "activate": to_activate, "deactivate": to_deactivate}


def _active_soccer(sports: list[dict]) -> list[dict]:
    return [
        s for s in sports
        if s.get("active") and (s.get("group") == "Soccer" or s.get("key", "").startswith("soccer_"))
    ]


def sync_catalogue() -> dict:
    provider = get_provider()
    if isinstance(provider, NullProvider):
        raise SystemExit("catalogue_sync : fournisseur non branché (MTJ_PROVIDER/MTJ_PROVIDER_KEY).")

    active = _active_soccer(provider.sports())  # gratuit
    active_by_key = {s["key"]: s for s in active}
    active_keys = set(active_by_key)

    with connect() as con, con.cursor() as cur:
        cur.execute("select odds_api_key, fd_code from league_catalog")
        existing = {k: fd for k, fd in cur.fetchall()}
        plan = plan_sync(active_keys, existing)

        # Nouvelles compétitions → cote seule, 1 relevé/j. fd_code = clé fournisseur
        # (pas de code football-data tant qu'elle n'est pas onboardée au modèle).
        for key in plan["insert"]:
            s = active_by_key[key]
            nom = s.get("title") or key
            pays = s.get("description") or ""
            cur.execute(
                """insert into league_catalog (fd_code, odds_api_key, nom, pays, regime, releves_par_jour)
                   values (%s, %s, %s, %s, 'cote_seule', 1)
                   on conflict (fd_code) do update set odds_api_key = excluded.odds_api_key,
                       nom = excluded.nom""",
                (key, key, nom, pays),
            )
            cur.execute(
                """insert into leagues (nom, pays, provider_ref, actif)
                   values (%s, %s, %s, true)
                   on conflict (provider_ref) do update set actif = true""",
                (nom, pays, key),
            )

        # Réactivation (compétitions connues redevenues actives) et désactivation
        # (fin de saison) — par le fd_code, pour ne pas toucher les 11 backtestées.
        if plan["activate"]:
            cur.execute(
                "update leagues set actif = true where provider_ref = any(%s)", (plan["activate"],)
            )
        if plan["deactivate"]:
            cur.execute(
                "update leagues set actif = false where provider_ref = any(%s)", (plan["deactivate"],)
            )

    # ALERTE proactive : une nouvelle compétition à graphie féminine/sélection ? On le
    # dit (et on envoie l'email best-effort) pour VÉRIFIER les listes de club_grouping
    # AVANT la prochaine réconciliation — la liste de motifs doit suivre le catalogue.
    a_verifier = competitions_a_verifier(
        plan["insert"], {k: active_by_key[k].get("title") for k in plan["insert"]}
    )
    if a_verifier:
        msg = ("catalogue : nouvelle(s) compétition(s) FÉMININE/SÉLECTION à vérifier avant "
               "la prochaine réconciliation club_id — " + ", ".join(a_verifier) +
               " — confronte GENRE_FEMININ / MARQUEURS_SELECTION / PAYS_CONNUS (club_grouping.py).")
        print("⚠ " + msg)
        from .alerts_email import envoyer_alerte
        envoyer_alerte([msg])

    modele = sum(1 for k in active_keys if classify(k) == "modele")
    eligible = sum(1 for k in active_keys if classify(k) == "eligible")
    print(
        f"catalogue_sync : {len(active_keys)} actives "
        f"({modele} modèle · {eligible} éligibles · {len(active_keys) - modele - eligible} cote seule) · "
        f"{len(plan['insert'])} ajoutées · {len(plan['activate'])} (ré)activées · "
        f"{len(plan['deactivate'])} désactivées."
    )
    return plan


def main() -> None:
    print_banner("catalogue_sync")
    sync_catalogue()


if __name__ == "__main__":
    main()
