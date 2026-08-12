# Backtest — l'étape qui peut tout arrêter (CLAUDE.md, brief §2.3)

**Non négociable, jamais compressée.** Avant d'afficher un seul chiffre à un
utilisateur, sur 2 saisons minimum :

1. **Calibration** (`calibration.py`) — regrouper les prédictions par tranche de
   5 % et vérifier que la fréquence observée correspond. Quand le modèle dit
   60 %, l'événement arrive ~60 % du temps.
2. **Comparaison aux cotes de clôture** (`closing_odds.py`) — convertir les cotes
   de clôture en probabilités implicites, retirer la marge, comparer au modèle.
   Le modèle ne doit pas être systématiquement décalé.
3. **Calibration du seuil « fragile »** (`fragile_threshold.py`) — déterminer sur
   données réelles le niveau de probabilité sous lequel une sélection fait
   statistiquement tomber un ticket. Point de départ à tester : 0,55.

Données : `football-data.co.uk` (CSV gratuits, résultats + cotes de clôture).

**Si le modèle n'est pas calibré, on ne construit pas la suite.** Le seuil calibré
remplace la constante `DEFAULT_FRAGILE_THRESHOLD` du moteur TypeScript.
