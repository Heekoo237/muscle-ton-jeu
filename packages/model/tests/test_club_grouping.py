"""Garde de population du regroupement club_id — la RÈGLE générale « même club réel ? ».

On vérifie que le garde SÉPARE ce qui ne peut pas être le même club (H/F, sélection/
club, pays différents) et FUSIONNE ce qui le peut (championnat + coupe, coupe
continentale). Logique pure, sans base — c'est là qu'est le risque d'analyse fausse."""
from mtj_model.pipeline.club_grouping import population_signature, regrouper


def test_signature_genre():
    assert population_signature("soccer_germany_bundesliga") == ("H", False, "germany")
    assert population_signature("soccer_germany_bundesliga_women") == ("F", False, "germany")


def test_signature_selection_vs_club():
    assert population_signature("soccer_uefa_nations_league")[1] is True
    # Qualif de Ligue des Champions = CLUB, pas sélection (le piège à éviter).
    assert population_signature("soccer_uefa_champs_league_qualification")[1] is False
    # Coupe du Monde des CLUBS : « club » dans la clé → pas une sélection.
    assert population_signature("soccer_fifa_club_world_cup")[1] is False


def test_signature_pays():
    assert population_signature("soccer_italy_coppa_italia")[2] == "italy"
    assert population_signature("soccer_epl")[2] is None          # 'epl' n'est pas un jeton pays
    assert population_signature("soccer_uefa_champs_league")[2] is None  # confédération, pas un pays


def _e(tid, nom, ck, sig):
    return {"id": tid, "nom": nom, "club_key": ck, "sig": sig}


def test_separe_masculin_et_feminin():
    ents = [
        _e(1, "Bayern Munich", "bayern munich", ("H", False, "germany")),
        _e(2, "Bayern Munich", "bayern munich", ("F", False, "germany")),
    ]
    club_of, rap = regrouper(ents, [])
    assert club_of[1] != club_of[2]
    assert rap["ecartes"] and "genre" in rap["ecartes"][0]["raison"]


def test_separe_selection_et_club():
    ents = [
        _e(1, "Andorra", "andorra", ("H", True, None)),         # sélection [nations league]
        _e(2, "Andorra CF", "andorra", ("H", False, "spain")),  # club [segunda]
    ]
    club_of, rap = regrouper(ents, [])
    assert club_of[1] != club_of[2]
    assert "sélection" in rap["ecartes"][0]["raison"]


def test_separe_homonymes_de_pays_differents():
    ents = [
        _e(1, "Vitoria", "vitoria", ("H", False, "brazil")),
        _e(2, "Vitória SC", "vitoria", ("H", False, "portugal")),
    ]
    club_of, rap = regrouper(ents, [])
    assert club_of[1] != club_of[2]
    assert "pays" in rap["ecartes"][0]["raison"]


def test_fusionne_championnat_et_coupe():
    # Le cas qu'on VEUT garder : Torino Serie A + Coppa Italia + Ligue des Champions.
    ents = [
        _e(1, "Torino", "torino", ("H", False, "italy")),          # Serie A
        _e(2, "Torino", "torino", ("H", False, "italy")),          # Coppa Italia
        _e(3, "Torino", "torino", ("H", False, None)),             # Champions League (pas de pays)
    ]
    club_of, rap = regrouper(ents, [])
    assert club_of[1] == club_of[2] == club_of[3]  # un seul club
    assert rap["fusions"] and not rap["ecartes"]


def test_fusionne_sheffield_championnat_et_coupe():
    ents = [
        _e(1, "Sheffield Wednesday", "sheffield wednesday", ("H", False, "england")),  # League One
        _e(2, "Sheffield Wednesday", "sheffield wednesday", ("H", False, None)),        # EFL Cup
    ]
    club_of, _ = regrouper(ents, [])
    assert club_of[1] == club_of[2]


def test_cooccurrence_dissout():
    # Deux adversaires qui partageraient une clé → club dissous (dernier filet).
    ents = [
        _e(1, "Racing", "racing", ("H", False, "spain")),
        _e(2, "Racing", "racing", ("H", False, "spain")),
    ]
    club_of, rap = regrouper(ents, [(1, 2)])
    assert club_of[1] == 1 and club_of[2] == 2  # chacun son id
    assert rap["cooccurrence"]
