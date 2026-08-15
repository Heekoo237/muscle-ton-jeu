"""Cœur du pipeline : logique PURE, sans base ni réseau (donc testable seule).

Entrée : l'historique des matchs joués d'un championnat, ses matchs à venir, et
les cotes relevées. Sortie : les lignes de `predictions` à écrire, avec la source
(cote / modèle / repli), la confiance et le seuil de fragilité applicable.

C'est ici que vit l'architecture hybride décidée au backtest (étape 4) :
  - marché « cote »  → cote d'ouverture dé-vigée (puissance) ; repli modèle sinon
  - marché « model » → probabilité Dixon-Coles
  - BTTS             → rien (suspendu, biais non corrigé)

Aucun nombre ne sort d'un LLM (règle d'or n°1). Tout est déterministe.
"""
from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from ..backtest.closing_odds import devig_power
from ..constants import (
    FRAGILE_THRESHOLD_COTE_SEULE,
    FRAGILE_THRESHOLDS,
    PROBABILITY_SOURCE,
    XI_PER_DAY,
    confidence_for,
)
from ..markets import market_probabilities
from ..poisson import score_matrix
from ..strength import fit_league
from .source_mode import SOURCE_MODEL_MARGIN

GRID = 11  # taille de la grille de scores (cohérent avec le backtest)

# Groupes de cotes à dé-viger ENSEMBLE (la marge se retire sur l'ensemble mutuel).
ODDS_GROUPS = {
    "1x2": ("WIN_HOME", "DRAW", "WIN_AWAY"),
    "ou25": ("OVER_2_5", "UNDER_2_5"),
}


@dataclass(frozen=True)
class PredictionRow:
    fixture_id: int
    marche: str
    probabilite: float
    confiance: float
    source: str          # "odds" | "model" | "repli"
    seuil_fragile: float | None
    bookmaker: str | None = None  # book source pour "odds" ; None pour "model"/"repli"


def valid_odds_group(vals: list) -> tuple[bool, str]:
    """Un groupe de cotes est-il DÉVIGEABLE ? `(ok, raison)`.

    Rejette ce qui n'a pas de sens sur un vrai marché — AVANT de chercher une racine
    (sinon `brentq` plante « f(a) et f(b) de même signe ») :
      - une cote absente du groupe → « cote_manquante » ;
      - une cote ≤ 1.00 → « cote_sous_1 » (impossible : gain nul ou négatif) ;
      - Σ des probabilités implicites < 1 → « marge_negative » (impossible sur un
        vrai book ; c'est le cas qui faisait planter le nocturne).
    """
    if any(v is None for v in vals):
        return False, "cote_manquante"
    if any(v <= 1.0 for v in vals):
        return False, "cote_sous_1"
    if sum(1.0 / v for v in vals) < 1.0 - 1e-9:
        return False, "marge_negative"
    return True, ""


def devig_fixture_odds_report(raw: dict[str, float]) -> tuple[dict[str, float], list[dict]]:
    """Comme `devig_fixture_odds`, mais renvoie AUSSI les groupes rejetés, avec la
    raison et les cotes exactes — de quoi voir une cote aberrante et la compter.

    Un groupe ENTIÈREMENT absent (aucune cote collectée) est silencieux : c'est un
    marché non relevé, pas une cote invalide. On ne rapporte que ce qui a AU MOINS
    une cote présente mais reste indévigeable.
    """
    out: dict[str, float] = {}
    invalides: list[dict] = []
    for nom, group in ODDS_GROUPS.items():
        vals = [raw.get(m) for m in group]
        if all(v is None for v in vals):
            continue  # marché non collecté — normal, silencieux
        cotes = {m: raw.get(m) for m in group}
        ok, raison = valid_odds_group(vals)
        if not ok:
            invalides.append({"groupe": nom, "raison": raison, "cotes": cotes})
            continue
        try:
            probs = devig_power(vals)
        except Exception as exc:  # noqa: BLE001 — filet ultime : un match ne plante jamais
            invalides.append({"groupe": nom, "raison": f"devig_echec:{type(exc).__name__}",
                              "cotes": cotes})
            continue
        out.update({m: float(p) for m, p in zip(group, probs)})
    return out, invalides


def devig_fixture_odds(raw: dict[str, float]) -> dict[str, float]:
    """Cotes décimales brutes → probabilités dé-vigées, par groupe mutuel.

    Un groupe n'est retenu que s'il est VALIDE (toutes présentes, > 1, marge ≥ 0).
    Une cote manquante ou aberrante laisse le marché sans probabilité → repli. Ne
    lève JAMAIS : un groupe indévigeable est simplement absent du résultat.
    """
    return devig_fixture_odds_report(raw)[0]


def _resolve(marche: str, model_probs: dict[str, float], market_probs: dict[str, float], margin_override: bool):
    """(probabilité, source) pour un marché, selon l'architecture hybride.

    `margin_override` : la ligue est en mode « modèle » car le book disponible est
    trop margé. On ignore alors la cote des marchés « odds » et on prend le modèle,
    en marquant la source « model_marge_excessive » (distincte de « model »).
    """
    configured = PROBABILITY_SOURCE[marche]
    if configured == "odds":
        if margin_override:
            return model_probs[marche], SOURCE_MODEL_MARGIN
        if marche in market_probs:
            return market_probs[marche], "odds"
        return model_probs[marche], "repli"  # cote absente → repli modèle
    return model_probs[marche], "model"


def _log_and_collect_invalid(bad: list[dict], league_code: str, fid: int,
                             books: dict, sink: list | None) -> None:
    """Journalise chaque groupe de cotes invalide (fixture, marché, valeurs EXACTES,
    books d'où viennent les cotes) et l'ajoute au collecteur pour le rapport de
    couverture. Une cote invalide fait sauter CE match, pas le nocturne — et elle se
    voit : on ne masque jamais une donnée qu'on refuse d'utiliser."""
    for b in bad:
        cotes_txt = ", ".join(f"{m}={v}" for m, v in b["cotes"].items())
        books_txt = ", ".join(f"{m}:{books.get(m, '?')}" for m in b["cotes"])
        print(f"[cote invalide] {league_code} fixture={fid} {b['groupe']} "
              f"{b['raison']} — {cotes_txt}  (books: {books_txt})")
        if sink is not None:
            sink.append({"fixture_id": fid, "league": league_code,
                         "groupe": b["groupe"], "raison": b["raison"],
                         "cotes": b["cotes"], "books": {m: books.get(m) for m in b["cotes"]}})


# Double chance DÉRIVÉE du 1X2 dé-vigé (arithmétique, pas une cote lue) : c'est le
# marché le plus joué, couvert partout, gratuitement. Source « cote_derivee »,
# distincte de « cote_seule », pour séparer le coté du déduit à la calibration.
_DC_DERIVED = {
    "DC_HOME_DRAW": ("WIN_HOME", "DRAW"),
    "DC_DRAW_AWAY": ("DRAW", "WIN_AWAY"),
    "DC_HOME_AWAY": ("WIN_HOME", "WIN_AWAY"),
}


def league_predictions_cote_seule(
    upcoming: pd.DataFrame,
    league_code: str,
    odds_by_fixture: dict[int, dict[str, float]] | None = None,
    book_by_fixture: dict[int, dict[str, str]] | None = None,
    invalides: list | None = None,
) -> list[PredictionRow]:
    """Prédictions d'un championnat en RÉGIME COTE SEULE (non backtesté).

    Aucun modèle, aucun historique : la probabilité vient UNIQUEMENT de la cote
    dé-vigée (calcul déterministe, règle d'or n°1 tenue). On produit :
      - 1X2 et plus/moins 2,5 → source « cote_seule » (cote lue et dé-vigée) ;
      - double chance → source « cote_derivee » (P(1X)=P(1)+P(X), arithmétique).
    Confiance BASSE toujours, barre de fragilité FIXE et conservatrice. Un marché
    dont le groupe de cotes est absent reste INCONNU (jamais deviné, règle n°3).
    """
    odds_by_fixture = odds_by_fixture or {}
    book_by_fixture = book_by_fixture or {}
    conf = round(confidence_for(league_code, "cote_seule"), 4)
    rows: list[PredictionRow] = []
    for m in upcoming.itertuples(index=False):
        fid = int(m.fixture_id)
        books = book_by_fixture.get(fid, {})
        # Dévigage TOLÉRANT : les groupes aberrants (marge négative, cote ≤ 1…) sont
        # rejetés et JOURNALISÉS, jamais dévigés — un match ne fait plus planter le run.
        market_probs, bad = devig_fixture_odds_report(odds_by_fixture.get(fid, {}))
        _log_and_collect_invalid(bad, league_code, fid, books, invalides)
        # 1X2 et plus/moins 2,5 : cote lue et dé-vigée → « cote_seule ».
        for marche, proba in market_probs.items():
            rows.append(PredictionRow(
                fixture_id=fid, marche=marche, probabilite=round(float(proba), 4),
                confiance=conf, source="cote_seule",
                seuil_fragile=FRAGILE_THRESHOLD_COTE_SEULE, bookmaker=books.get(marche),
            ))
        # Double chance : DÉRIVÉE du 1X2 dé-vigé (seulement si le 1X2 est présent).
        if all(k in market_probs for k in ("WIN_HOME", "DRAW", "WIN_AWAY")):
            for marche, (a, b) in _DC_DERIVED.items():
                rows.append(PredictionRow(
                    fixture_id=fid, marche=marche,
                    probabilite=round(float(market_probs[a] + market_probs[b]), 4),
                    confiance=conf, source="cote_derivee",
                    seuil_fragile=FRAGILE_THRESHOLD_COTE_SEULE, bookmaker=None,
                ))
    return rows


def league_predictions(
    history: pd.DataFrame,
    upcoming: pd.DataFrame,
    league_code: str,
    ref_date: pd.Timestamp,
    odds_by_fixture: dict[int, dict[str, float]] | None = None,
    book_by_fixture: dict[int, dict[str, str]] | None = None,
    margin_override: bool = False,
    invalides: list | None = None,
) -> list[PredictionRow]:
    """Prédictions d'un championnat pour ses matchs à venir.

    - `history`  : matchs joués (colonnes home, away, fthg, ftag, date).
    - `upcoming` : matchs à venir (colonnes fixture_id, home, away).
    - `odds_by_fixture` : {fixture_id: {marché: cote décimale}} relevées.

    Une équipe inconnue du fit (ex. promue sans historique) → aucune ligne pour
    ce match : ses marchés restent INCONNUS (règle d'archi n°3), jamais devinés.
    """
    odds_by_fixture = odds_by_fixture or {}
    book_by_fixture = book_by_fixture or {}
    if history.empty or history["home"].nunique() < 4:
        return []
    fit = fit_league(history, ref_date, XI_PER_DAY)

    rows: list[PredictionRow] = []
    for m in upcoming.itertuples(index=False):
        eg = fit.expected_goals(m.home, m.away)
        if eg is None:
            continue  # équipe inconnue → marchés inconnus, on n'écrit rien
        model_probs = market_probabilities(score_matrix(eg[0], eg[1], fit.rho, size=GRID))
        books = book_by_fixture.get(int(m.fixture_id), {})  # {marché: book} — le 1X2 et
        # le plus/moins 2,5 peuvent venir de books différents (voir provider.parse_odds).
        # Dévigage tolérant : une cote aberrante → repli modèle, journalisée, jamais un crash.
        market_probs, bad = devig_fixture_odds_report(odds_by_fixture.get(m.fixture_id, {}))
        _log_and_collect_invalid(bad, league_code, int(m.fixture_id), books, invalides)
        for marche in PROBABILITY_SOURCE:  # marchés couverts non-BTTS
            proba, source = _resolve(marche, model_probs, market_probs, margin_override)
            rows.append(PredictionRow(
                fixture_id=int(m.fixture_id),
                marche=marche,
                probabilite=round(float(proba), 4),
                confiance=round(confidence_for(league_code, source), 4),
                source=source,
                seuil_fragile=FRAGILE_THRESHOLDS.get(marche),
                bookmaker=books.get(marche) if source == "odds" else None,
            ))
    return rows
