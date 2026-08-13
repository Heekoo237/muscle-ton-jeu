"""Pipeline de production (brief §5.1) — le code qui a produit les courbes de
calibration EST le code qui tourne en production.

Ligne de partage stricte :
  - Python offline  : entraînement, calibration, backtest (mtj_model.backtest)
  - Python nocturne : calcule les probabilités, ÉCRIT dans Postgres (nightly)
  - Python 6 h      : collecteur de cotes, historise les mouvements (collector)
  - TypeScript      : l'application, qui ne fait que LIRE la table predictions

L'application ne parle jamais à Python. Elle lit Postgres. Aucune écriture dans
`predictions` depuis l'app, jamais (règle d'archi n°1 et 2).

Deux jobs DISTINCTS, jamais fusionnés :
  - collector : relève les cotes toutes les 6 h, historise
  - nightly   : calcule les probabilités une fois par jour
"""
