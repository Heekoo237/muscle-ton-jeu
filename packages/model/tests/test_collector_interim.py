"""Intérim cote seule du collecteur en régime MODÈLE.

Le collecteur écrit désormais une prédiction cote seule intérimaire pour les
championnats MODÈLE aussi (ferme le trou de 24 h avant le nocturne), MAIS
uniquement pour les matchs sans proba modèle — pour ne JAMAIS écraser ni
rétrograder une probabilité calibrée. On verrouille cet invariant ici.
"""
from mtj_model.pipeline.predictions_io import fixtures_deja_modelisees


class _Cursor:
    def __init__(self, rows):
        self._rows = rows
        self.sql = None
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params):
        self.sql = sql
        self.params = params

    def fetchall(self):
        return self._rows


class _Con:
    def __init__(self, rows):
        self._cur = _Cursor(rows)

    def cursor(self):
        return self._cur


def test_construit_le_set_des_fixtures_modelisees():
    # La base renvoie les matchs 1 et 5 (source modèle) ; 9 n'en a pas.
    con = _Con([(1,), (5,)])
    assert fixtures_deja_modelisees(con, [1, 5, 9]) == {1, 5}


def test_liste_vide_ne_touche_pas_la_base():
    con = _Con([("ne devrait pas être lu",)])
    assert fixtures_deja_modelisees(con, []) == set()


def test_requete_exclut_les_sources_cote_seule_et_derivee():
    # L'invariant anti-clobber vit dans le WHERE : on ne compte comme « déjà
    # modélisé » QUE les sources modèle (donc PAS cote_seule / cote_derivee), sinon
    # le collecteur croirait un match modélisé et cesserait de rafraîchir l'intérim.
    con = _Con([])
    fixtures_deja_modelisees(con, [2, 3])
    assert "not in ('cote_seule', 'cote_derivee')" in con.cursor().sql
    assert con.cursor().params == ([2, 3],)
