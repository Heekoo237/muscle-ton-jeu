"""settle_scores.py — Rafraîchit les scores UNIQUEMENT pour les championnats qui en
ont besoin : ceux portant au moins un ticket non réglé dont le coup d'envoi est passé.

Pourquoi ce job séparé (et pas le nocturne). Le suivi de résultat a besoin de scores
FRAIS toutes les 6 h, mais sonder tous les championnats à chaque passage gaspille des
crédits. Ici on ne paie QUE pour ce qu'on doit régler : les jours sans ticket en
attente, zéro ligue sondée, ZÉRO crédit. Le coût de la fonctionnalité « notifications »
est ainsi isolé et journalisé À PART du collecteur (ligne « [settle-scores] … crédits »).

Le règlement lui-même (comparer le score au marché) et l'envoi vivent côté app : ce
job n'écrit que des scores en base (règle d'archi n°4 : le fournisseur reste dans
provider.py, un seul service). L'app lit ensuite la base, gratuitement.

LIMITE DOCUMENTÉE — le fournisseur ne score pas TOUTES les compétitions qu'il price.
The Odds API vend des COTES pour ~44 compétitions foot, mais son endpoint `/scores` ne
couvre pas les mêmes : certaines compétitions (surtout des divisions inférieures /
coupes, donc en régime « cote seule ») ont des cotes mais AUCUN score. Pour ces
matchs-là, `finished` n'arrive jamais — le ticket ne peut pas être réglé, quoi qu'on
fasse. Ce n'est pas un bug de notre pipeline : c'est une frontière de la donnée, comme
`hors_couverture` l'est pour les cotes. Conséquences assumées :
  - le rafraîchissement des scores est ISOLÉ par ligue (sync.refresh_scores) : une
    compétition non scorée (ou qui lève) ne prive JAMAIS les autres de leurs scores ;
  - côté app, un ticket dont le dernier match réglable est passé depuis > 5 j sans
    score passe au statut honnête « résultat indisponible » (domain/settle :
    resultatIntrouvable) — on ne le laisse pas « en attente » à vie ;
  - la surveillance (health.py) alerte si une MÊME ligue échoue de façon récurrente,
    pour distinguer une vraie panne (clé morte) d'une compétition simplement non scorée.
"""
from __future__ import annotations

import json

from .db import connect
from .provider import get_provider, NullProvider
from .sync import resolve_fixture
from .version import print_banner

# /scores ne renvoie les matchs TERMINÉS que si daysFrom est fourni (coût 2 crédits
# par ligue, IDENTIQUE quel que soit daysFrom de 1 à 3). On prend donc le MAXIMUM
# autorisé par le fournisseur (3) : à coût égal, on rattrape un match terminé il y a
# jusqu'à 3 jours. En deçà, un match manqué (creux de collecte, résolution tardive)
# tombait hors fenêtre et restait « non terminé » pour toujours. Limite dure : au-delà
# de 3 jours, /scores ne renvoie plus le match — il est alors irrécupérable côté fournisseur.
DAYS_FROM = 3

# Championnats à sonder : un fixture non terminé, coup d'envoi passé, porté par un
# ticket analysé récent PAS ENCORE notifié (le suivi de résultat n'est pas parti).
LEAGUES_SQL = """
    select distinct l.id, c.odds_api_key, c.fd_code
      from tickets t
      join selections s on s.ticket_id = t.id
      join fixtures f   on f.id = s.fixture_id
      join leagues l    on l.id = f.league_id
      join league_catalog c on c.fd_code = l.provider_ref
     where t.statut = 'analyse'
       and t.cree_le >= now() - interval '7 days'
       and s.etat_resolution = 'certain'
       and s.marche is not null
       and f.statut <> 'finished'
       and f.date_utc <= now()
       and not exists (select 1 from notifications_sent n where n.cle = 'settle:' || t.id)
     order by c.fd_code
"""


def leagues_a_sonder(con) -> list[dict]:
    with con.cursor() as cur:
        cur.execute(LEAGUES_SQL)
        return [
            {"league_id": r[0], "odds_api_key": r[1], "fd_code": r[2]} for r in cur.fetchall()
        ]


def refresh_pending_scores() -> dict:
    """Sonde les scores des seules ligues en attente. Renvoie un résumé (avec crédits)."""
    provider = get_provider()
    if isinstance(provider, NullProvider):
        print("[settle-scores] fournisseur non branché : aucun score sondé.")
        return {"leagues": 0, "ecrits": 0, "credits": 0, "fournisseur": False}

    with connect() as con:
        leagues = leagues_a_sonder(con)
        if not leagues:
            # Le cas fréquent et VOULU : rien à régler → aucun appel fournisseur.
            print("[settle-scores] aucun ticket en attente : 0 ligue sondée, 0 crédit.")
            return {"leagues": 0, "ecrits": 0, "credits": 0, "fournisseur": True}

        ecrits = 0
        erreurs: dict[str, str] = {}
        for lg in leagues:
            try:
                for fx in provider.scores(lg["odds_api_key"], days_from=DAYS_FROM):
                    if fx.status == "finished":
                        resolve_fixture(con, lg["league_id"], fx)
                        ecrits += 1
            except Exception as exc:  # noqa: BLE001
                erreurs[lg["fd_code"]] = str(exc)[:200]

    credits = getattr(provider, "credits_used", None)
    resume = {
        "leagues": len(leagues),
        "codes": [lg["fd_code"] for lg in leagues],
        "ecrits": ecrits,
        "credits": credits,
        "fournisseur": True,
    }
    if erreurs:
        resume["erreurs"] = erreurs
    # Journal SÉPARÉ du collecteur : on voit exactement ce que coûte le suivi de résultat.
    print(
        f"[settle-scores] {len(leagues)} ligue(s) sondée(s) "
        f"({', '.join(resume['codes'])}), {ecrits} match(s) terminé(s) écrit(s), "
        f"crédits={credits}"
    )
    for code, e in sorted(erreurs.items()):
        print(f"  {code} ÉCHEC : {e}")
    return resume


def main() -> None:
    print_banner("settle-scores")
    refresh_pending_scores()


if __name__ == "__main__":
    main()
