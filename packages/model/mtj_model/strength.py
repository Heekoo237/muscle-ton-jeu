"""Forces d'équipes par vraisemblance pondérée (brief §2.2 étapes 1-2).

Dixon-Coles : chaque équipe a une force d'attaque `a` et de défense `d` ; un
avantage du terrain `home` est estimé PAR CHAMPIONNAT ; un intercept `mu` fixe le
niveau de buts ; `rho` corrige les scores faibles. Les buts attendus d'un match :

    log λ_domicile = mu + a[dom] - d[ext] + home
    log λ_extérieur = mu + a[ext] - d[dom]

L'asymétrie domicile/extérieur passe par `home` (et par la place de chaque équipe
dans la formule) : c'est le paramétrage identifiable et calibrable de la
littérature. Les forces sont centrées (moyenne nulle) pour l'identifiabilité.

Pondération par récence : chaque match pèse exp(-ξ · âge_en_jours) au moment de
la prédiction. ξ est calibré séparément par vraisemblance (voir calibrate.py).

Un modèle est ajusté PAR CHAMPIONNAT : les forces ne sont pas comparables d'une
ligue à l'autre, et l'avantage du terrain diffère.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize

RHO_BOUNDS = (-0.2, 0.05)
_A_BOUND = (-3.0, 3.0)


@dataclass
class FittedLeague:
    teams: list[str]
    index: dict[str, int]
    attack: np.ndarray  # centré (moyenne 0)
    defense: np.ndarray  # centré (moyenne 0)
    mu: float
    home: float
    rho: float
    n_matches: int
    params: np.ndarray  # vecteur brut, pour démarrage à chaud

    def expected_goals(self, home_team: str, away_team: str) -> tuple[float, float] | None:
        """(λ_domicile, λ_extérieur) ; None si une équipe est inconnue du fit."""
        ih = self.index.get(home_team)
        ia = self.index.get(away_team)
        if ih is None or ia is None:
            return None
        lh = np.exp(self.mu + self.attack[ih] - self.defense[ia] + self.home)
        la = np.exp(self.mu + self.attack[ia] - self.defense[ih])
        return float(lh), float(la)


def _prepare(df: pd.DataFrame, ref_date: pd.Timestamp, xi: float):
    teams = sorted(set(df["home"]) | set(df["away"]))
    index = {t: i for i, t in enumerate(teams)}
    hi = df["home"].map(index).to_numpy()
    ai = df["away"].map(index).to_numpy()
    gh = df["fthg"].to_numpy(dtype=float)
    ga = df["ftag"].to_numpy(dtype=float)
    age = (ref_date - df["date"]).dt.days.to_numpy(dtype=float)
    w = np.exp(-xi * np.clip(age, 0, None))
    return teams, index, hi, ai, gh, ga, w


def fit_league(
    df: pd.DataFrame,
    ref_date: pd.Timestamp,
    xi: float,
    start: np.ndarray | None = None,
) -> FittedLeague:
    """Ajuste le modèle sur les matchs d'UN championnat, pondérés vers `ref_date`."""
    teams, index, hi, ai, gh, ga, w = _prepare(df, ref_date, xi)
    t = len(teams)

    m00 = (gh == 0) & (ga == 0)
    m01 = (gh == 0) & (ga == 1)
    m10 = (gh == 1) & (ga == 0)
    m11 = (gh == 1) & (ga == 1)

    def unpack(p):
        a = p[:t] - p[:t].mean()
        d = p[t : 2 * t] - p[t : 2 * t].mean()
        return a, d, p[2 * t], p[2 * t + 1], p[2 * t + 2]

    def nll(p):
        a, d, mu, home, rho = unpack(p)
        loglh = mu + a[hi] - d[ai] + home
        logla = mu + a[ai] - d[hi]
        lh = np.exp(loglh)
        la = np.exp(logla)
        ll = gh * loglh - lh + ga * logla - la
        tau = np.ones_like(ll)
        tau[m00] = 1.0 - lh[m00] * la[m00] * rho
        tau[m01] = 1.0 + lh[m01] * rho
        tau[m10] = 1.0 + la[m10] * rho
        tau[m11] = 1.0 - rho
        ll = ll + np.log(np.clip(tau, 1e-10, None))
        return -np.sum(w * ll)

    if start is None or len(start) != 2 * t + 3:
        p0 = np.zeros(2 * t + 3)
        p0[2 * t] = np.log(max(gh.mean() + ga.mean(), 0.5) / 2.0)  # mu ≈ log(buts/équipe)
        p0[2 * t + 1] = 0.25  # avantage du terrain
        p0[2 * t + 2] = -0.05  # rho
    else:
        p0 = start.copy()

    bounds = [_A_BOUND] * (2 * t) + [(-1.0, 1.5), (-0.5, 1.0), RHO_BOUNDS]
    res = minimize(nll, p0, method="L-BFGS-B", bounds=bounds, options={"maxiter": 400})
    a, d, mu, home, rho = unpack(res.x)
    return FittedLeague(teams, index, a, d, float(mu), float(home), float(rho), len(gh), res.x)
