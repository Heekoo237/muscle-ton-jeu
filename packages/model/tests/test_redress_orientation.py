"""Redressement d'orientation — la DÉCISION par fixture, en logique pure.

`decider` compare l'orientation en base au `home_team` du dernier relevé fournisseur
et tranche : réoriente / déjà aligné (DC périmée) / non ré-ancrable / noms divergents.
On la teste sans base ni fournisseur (c'est là qu'est le risque : re-retourner un
fixture correct). L'objet d'email (motif en tête) est testé à côté."""
import inspect

from mtj_model.pipeline.alerts_email import sujet_depuis_alertes
from mtj_model.pipeline import redress_orientation
from mtj_model.pipeline.redress_orientation import Decision, FixtureRetourne, decider


def test_fenetre_ne_parametre_jamais_un_interval_literal():
    """Garde-fou contre le bug qui a fait diverger les deux outils : psycopg rend
    `interval '%s days'` en `interval '$1 days'` — le nombre reste DANS la chaîne,
    Postgres lit « 0 jour », la fenêtre se réduit à un instant → 0 ligne, sans erreur.
    On EXIGE l'idiome qui bind vraiment (`%s * interval '1 day'`), comme le nocturne."""
    src = inspect.getsource(redress_orientation.fixtures_retournes)
    assert "interval '%s" not in src, "placeholder DANS un literal interval → fenêtre morte"
    assert "* interval '1 day'" in src, "utiliser (%s * interval '1 day') pour paramétrer les jours"


def _fx(home="Rennes", away="Paris SG", ref="evt1"):
    # wh/dr/dc : peu importe ici — `decider` tranche sur les NOMS, pas les probas.
    return FixtureRetourne(
        fixture_id=1, provider_ref=ref, league_id=10, date_utc="2026-09-05T18:00:00+00:00",
        home_id=100, away_id=200, home_nom=home, away_nom=away, wh=0.08, dr=0.15, dc=0.86,
    )


def test_reoriente_quand_le_fournisseur_inverse_le_domicile():
    # Base : Rennes (dom) – Paris SG (ext). Fournisseur : Paris SG reçoit… non :
    # fournisseur dit home=Paris SG → l'inverse de la base → on réoriente.
    d = decider(_fx(), {"evt1": ("Paris SG", "Rennes")})
    assert d.kind == "reoriente"
    assert d.home_cible == "Paris SG"


def test_deja_aligne_quand_le_fournisseur_confirme_le_domicile():
    # Même orientation des deux côtés → l'orientation est bonne ; c'est la DC modèle
    # qui est périmée. On n'inverse PAS ; on efface les predictions (nocturne refait).
    d = decider(_fx(), {"evt1": ("Rennes", "Paris SG")})
    assert d.kind == "deja_aligne"


def test_non_reancrable_quand_le_fournisseur_ne_porte_plus_le_match():
    d = decider(_fx(ref="evt1"), {})  # absent du dernier relevé
    assert d.kind == "non_reancrable"
    d2 = decider(_fx(ref=None), {"evt1": ("Rennes", "Paris SG")})
    assert d2.kind == "non_reancrable"


def test_noms_divergent_on_ne_devine_pas():
    # Le fournisseur nomme des équipes qu'on ne reconnaît pas des deux stockées :
    # c'est un alias, pas une orientation. On ne touche à rien.
    d = decider(_fx(), {"evt1": ("Stade Rennais", "PSG")})
    assert d.kind == "noms_divergent"


def test_reoriente_tolere_la_casse_et_les_accents():
    # normalize_team_name doit neutraliser casse/accents avant comparaison.
    d = decider(_fx(home="Rennes", away="Paris SG"), {"evt1": ("PARIS SG", "rennes")})
    assert d.kind == "reoriente"


def test_appliquer_ne_touche_que_reoriente_et_deja_aligne():
    # Garde-fou de forme : les deux cas "à ne pas toucher" ne portent pas de cible d'écriture.
    assert Decision(_fx(), "non_reancrable").kind == "non_reancrable"
    assert Decision(_fx(), "noms_divergent").kind == "noms_divergent"


# ── objet d'email : le MOTIF en tête ──
def test_sujet_porte_le_motif_en_tete():
    s = sujet_depuis_alertes(["orientation : 18 fixture(s) RETOURNÉ(s) — favoris opposés"])
    assert s.startswith("MTJ alerte — orientation : 18 fixture(s)")


def test_sujet_compte_les_autres_alertes():
    s = sujet_depuis_alertes(["orientation : 18 retournés", "crédits bas", "schéma manquant"])
    assert "(+2 autres)" in s


def test_sujet_tronque_les_messages_trop_longs():
    s = sujet_depuis_alertes(["x" * 500])
    assert len(s) <= len("MTJ alerte — ") + 120


def test_sujet_sans_alerte():
    assert "frais" in sujet_depuis_alertes([])
