"""Pipeline nocturne (brief §5.1). Tourne ~4 h du matin, aucun utilisateur connecté.

À la fin, toutes les probabilités des ~300 prochains matchs sont calculées et
écrites dans la table `predictions`. Le chemin temps réel ne fait que les lire.

Squelette — implémentation en Session 7/8 (branchement base + fournisseur réel).
"""
from __future__ import annotations


def run_nightly() -> None:
    """Séquence nocturne :

    1. Récupérer les résultats de la veille          -> base
    2. Récupérer le calendrier des 7 prochains jours -> base
    3. Recalculer les forces d'équipes               -> base
    4. Pour chaque match à venir : λ, grille 7×7, marchés -> predictions
    5. Comparer aux cotes du marché -> alerte si dérive
    6. Régler les tickets terminés  -> notifications de suivi
    """
    raise NotImplementedError("Session 7/8 — pipeline nocturne complet")
