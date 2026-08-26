"""alerts_email.py — Alerte email avec le MOTIF en objet (best-effort).

GitHub envoie déjà un email quand un run planifié échoue — mais il dit seulement
« Run failed », jamais QUOI. « Orientation : 18 fixtures retournées » en objet, ça
dit tout de suite s'il faut se lever. Ce module envoie cet email-là, en plus de
celui de GitHub (qui reste le filet de sécurité).

BEST-EFFORT et SANS DÉPENDANCE : appel HTTP (urllib) au fournisseur d'email, piloté
par des secrets. Si un secret manque, on NE fait rien et on le dit — on ne casse
jamais la surveillance pour un email (elle sort quand même en code 1 → email GitHub).

Secrets (variables d'environnement, à poser dans les secrets GitHub) :
  - MTJ_ALERT_EMAIL_KEY  : clé API du fournisseur (Resend). Absente → pas d'email.
  - MTJ_ALERT_EMAIL_TO   : destinataire.
  - MTJ_ALERT_EMAIL_FROM : expéditeur (domaine vérifié chez le fournisseur).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

_ENDPOINT = "https://api.resend.com/emails"
_SUJET_MAX = 120  # objet lisible sur un téléphone, motif en tête


def sujet_depuis_alertes(alertes: list[str]) -> str:
    """Objet portant le MOTIF : la 1re alerte (tronquée), + le nombre d'autres.

    PURE (testable sans réseau). « MTJ alerte — orientation : 18 fixture(s)… (+2 autres) »."""
    if not alertes:
        return "MTJ — tous les jobs sont frais"
    tete = alertes[0].replace("\n", " ").strip()
    if len(tete) > _SUJET_MAX:
        tete = tete[: _SUJET_MAX - 1].rstrip() + "…"
    reste = len(alertes) - 1
    suffixe = f" (+{reste} autre{'s' if reste > 1 else ''})" if reste else ""
    return f"MTJ alerte — {tete}{suffixe}"


def envoyer_alerte(alertes: list[str]) -> bool:
    """Envoie l'email d'alerte. Renvoie True si envoyé, False si sauté/échoué.

    Ne LÈVE jamais : une panne d'email ne doit pas casser la surveillance."""
    key = os.environ.get("MTJ_ALERT_EMAIL_KEY")
    to = os.environ.get("MTJ_ALERT_EMAIL_TO")
    frm = os.environ.get("MTJ_ALERT_EMAIL_FROM")
    if not (key and to and frm):
        print("  (email d'alerte non configuré — MTJ_ALERT_EMAIL_* absents ; "
              "repli sur l'email d'échec GitHub.)")
        return False
    corps = "Pipeline Muscle Ton Jeu — alerte(s) :\n\n" + "\n".join(f"  - {a}" for a in alertes)
    charge = json.dumps({
        "from": frm, "to": [to],
        "subject": sujet_depuis_alertes(alertes), "text": corps,
    }).encode("utf-8")
    req = urllib.request.Request(
        _ENDPOINT, data=charge, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:  # noqa: S310 (endpoint de confiance)
            ok = 200 <= r.status < 300
            print("  email d'alerte envoyé." if ok else f"  email d'alerte : statut {r.status}.")
            return ok
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"  email d'alerte NON envoyé ({type(exc).__name__}) — repli email GitHub.")
        return False
