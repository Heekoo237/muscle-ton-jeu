"""La décision de synchro (insérer / (ré)activer / désactiver) est pure et sûre.

Auto-activation : une compétition qui redevient active se rallume seule ; une fin
de saison se désactive sans rien supprimer ; une nouvelle est créée en cote seule.
"""
from mtj_model.pipeline.catalogue_sync import plan_sync

CAN = "soccer_africa_cup_of_nations"


def test_nouvelle_competition_inseree_en_cote_seule():
    active = {"soccer_epl", "soccer_france_ligue_two"}
    existing = {"soccer_epl": "E0"}  # seule l'EPL est déjà cataloguée
    plan = plan_sync(active, existing)
    assert plan["insert"] == ["soccer_france_ligue_two"]
    assert plan["activate"] == ["E0"]
    assert plan["deactivate"] == []


def test_fin_de_saison_desactive_sans_supprimer():
    active = {"soccer_epl"}
    existing = {"soccer_epl": "E0", CAN: CAN}  # la CAN était active, ne l'est plus
    plan = plan_sync(active, existing)
    assert plan["deactivate"] == [CAN]
    assert plan["insert"] == []


def test_hors_saison_qui_revient_se_reactive():
    # La CAN, connue mais désactivée, redevient active → (ré)activation par fd_code.
    active = {"soccer_epl", CAN}
    existing = {"soccer_epl": "E0", CAN: CAN}
    plan = plan_sync(active, existing)
    assert CAN in plan["activate"]
    assert plan["deactivate"] == []


def test_les_11_ne_sont_pas_reinserees():
    # Une compétition backtestée (fd_code ≠ clé) reste reconnue par sa clé The Odds
    # API : on l'active, on ne la ré-insère jamais avec fd_code = clé.
    active = {"soccer_spl"}
    existing = {"soccer_spl": "SC0"}
    plan = plan_sync(active, existing)
    assert plan["insert"] == []
    assert plan["activate"] == ["SC0"]
