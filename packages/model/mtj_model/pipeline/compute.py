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


def devig_fixture_odds(raw: dict[str, float]) -> dict[str, float]:
    """Cotes décimales brutes → probabilités dé-vigées, par groupe mutuel.

    Un groupe n'est retenu que si TOUTES ses cotes sont présentes et valides
    (> 1). Une cote manquante laisse le marché sans probabilité de marché → repli.
    """
    out: dict[str, float] = {}
    for group in ODDS_GROUPS.values():
        vals = [raw.get(m) for m in group]
        if all(v is not None and v > 1.0 for v in vals):
            probs = devig_power(vals)
            out.update({m: float(p) for m, p in zip(group, probs)})
    return out


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


def league_predictions(
    history: pd.DataFrame,
    upcoming: pd.DataFrame,
    league_code: str,
    ref_date: pd.Timestamp,
    odds_by_fixture: dict[int, dict[str, float]] | None = None,
    book_by_fixture: dict[int, str] | None = None,
    margin_override: bool = False,
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
        market_probs = devig_fixture_odds(odds_by_fixture.get(m.fixture_id, {}))
        book = book_by_fixture.get(int(m.fixture_id))
        for marche in PROBABILITY_SOURCE:  # marchés couverts non-BTTS
            proba, source = _resolve(marche, model_probs, market_probs, margin_override)
            rows.append(PredictionRow(
                fixture_id=int(m.fixture_id),
                marche=marche,
                probabilite=round(float(proba), 4),
                confiance=round(confidence_for(league_code, source), 4),
                source=source,
                seuil_fragile=FRAGILE_THRESHOLDS.get(marche),
                bookmaker=book if source == "odds" else None,
            ))
    return rows
