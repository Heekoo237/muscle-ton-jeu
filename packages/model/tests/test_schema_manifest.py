"""test_schema_manifest.py — le manifeste de schéma se vérifie TOUT SEUL.

La règle d'architecture n°8 (« toute migration qui ajoute un objet lu par le code
ajoute sa ligne au manifeste ») reposait sur la seule discipline. Ces tests en
automatisent la part vérifiable, et disent honnêtement ce qui reste humain.

CE QUI EST AUTOMATISÉ :
  1. COHÉRENCE — chaque entrée du manifeste cite une migration qui EXISTE et qui
     CRÉE VRAIMENT l'objet nommé. Catch : numéro de migration faux, objet renommé,
     entrée fantôme. (robuste : on cherche le nom dans le fichier, pas de parse SQL.)
  2. FONCTIONS — toute fonction créée par une migration est au manifeste (ou dans une
     allowlist d'UNE entrée : `verifier_schema`, le moteur lui-même). Catch : on a
     ajouté une fonction SQL lue par le code et oublié de l'inscrire. C'est le mode de
     panne le plus dur (fonction manquante = 500 garanti dès que le chemin s'exécute),
     et l'allowlist est minuscule → le test est simple ET utile.

CE QUI RESTE HUMAIN (et pourquoi) : les COLONNES et les TABLES. Le manifeste est
CURÉ, pas exhaustif — il liste 3 tables sur ~25, parce qu'on n'y met que les objets
dont l'absence casse le produit. Un test « toute colonne/table créée doit être au
manifeste » se BATTRAIT contre ce choix : il faudrait une allowlist de ~40 objets
non-critiques, aussi fragile que la discipline qu'elle remplace. Décider « cet objet
est-il lu par le code au point de faire un 500 ? » est une propriété sémantique qu'un
scan SQL ne connaît pas. On garde donc la règle n°8 pour colonnes/tables, et on
automatise là où c'est net : la cohérence, et les fonctions.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_DB = Path(__file__).resolve().parents[2] / "db"
_MIGRATIONS = _DB / "migrations"
_MANIFEST = _DB / "schema_manifest.json"

# Fonctions créées par une migration mais VOLONTAIREMENT hors manifeste.
# `verifier_schema` est le moteur du contrôle lui-même : le vérifier via le manifeste
# serait circulaire (son absence est signalée à part, comme « moteur absent »).
FONCTIONS_HORS_MANIFESTE = {"verifier_schema"}


def _manifest() -> dict:
    return json.loads(_MANIFEST.read_text(encoding="utf-8"))


def _migration_file(num: str) -> Path | None:
    """Le fichier 00NN_*.sql pour un numéro de migration, ou None s'il n'existe pas."""
    matches = sorted(_MIGRATIONS.glob(f"{num}_*.sql"))
    return matches[0] if matches else None


def test_manifest_entries_point_at_real_migrations():
    """Chaque objet du manifeste cite une migration qui existe ET le crée vraiment."""
    m = _manifest()
    problemes: list[str] = []

    for c in m.get("columns", []):
        f = _migration_file(c["migration"])
        if f is None:
            problemes.append(f"colonne {c['table']}.{c['column']} → migration {c['migration']} INTROUVABLE")
        elif c["column"] not in f.read_text(encoding="utf-8"):
            problemes.append(f"colonne {c['column']} absente du texte de {f.name}")

    for t in m.get("tables", []):
        f = _migration_file(t["migration"])
        if f is None:
            problemes.append(f"table {t['table']} → migration {t['migration']} INTROUVABLE")
        elif t["table"] not in f.read_text(encoding="utf-8"):
            problemes.append(f"table {t['table']} absente du texte de {f.name}")

    for fn in m.get("functions", []):
        f = _migration_file(fn["migration"])
        if f is None:
            problemes.append(f"fonction {fn['name']} → migration {fn['migration']} INTROUVABLE")
        elif fn["name"] not in f.read_text(encoding="utf-8"):
            problemes.append(f"fonction {fn['name']} absente du texte de {f.name}")

    assert not problemes, "Manifeste incohérent :\n  " + "\n  ".join(problemes)


def test_rls_entries_point_at_real_migrations():
    """Chaque table de la section 'rls' cite une migration qui l'active vraiment."""
    problemes: list[str] = []
    for r in _manifest().get("rls", []):
        f = _migration_file(r["migration"])
        if f is None:
            problemes.append(f"rls {r['table']} → migration {r['migration']} INTROUVABLE")
        else:
            txt = f.read_text(encoding="utf-8")
            # La migration doit nommer la table ET activer la RLS.
            if r["table"] not in txt or "ROW LEVEL SECURITY" not in txt.upper():
                problemes.append(f"rls {r['table']} : {f.name} n'active pas la RLS sur cette table")
    assert not problemes, "Section rls incohérente :\n  " + "\n  ".join(problemes)


def test_every_migration_function_is_in_manifest():
    """TRIPWIRE : toute fonction créée par une migration est au manifeste (ou allowlist).

    Si ce test casse en ajoutant une migration : soit la fonction est lue par le code
    → ajoute-la à schema_manifest.json (functions) ; soit elle est purement interne
    → ajoute-la à FONCTIONS_HORS_MANIFESTE avec un commentaire disant pourquoi.
    Le point : l'omission devient BRUYANTE au lieu d'être silencieuse.
    """
    au_manifeste = {fn["name"] for fn in _manifest().get("functions", [])}
    motif = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+(\w+)", re.IGNORECASE)

    orphelines: list[str] = []
    for sql in sorted(_MIGRATIONS.glob("*.sql")):
        for nom in motif.findall(sql.read_text(encoding="utf-8")):
            if nom in au_manifeste or nom in FONCTIONS_HORS_MANIFESTE:
                continue
            orphelines.append(f"{nom} (créée dans {sql.name})")

    assert not orphelines, (
        "Fonction(s) SQL absente(s) du manifeste — ajoute au manifeste si le code les "
        "lit, sinon à FONCTIONS_HORS_MANIFESTE :\n  " + "\n  ".join(sorted(set(orphelines)))
    )


def test_manifest_covers_the_known_functions():
    """Garde-fou du garde-fou : les 9 fonctions attendues sont bien là (détecte une
    suppression accidentelle d'entrée du manifeste)."""
    au_manifeste = {fn["name"] for fn in _manifest().get("functions", [])}
    attendues = {
        "confirmer_recharge", "consommer_analyse_offerte", "hit_rate_limit",
        "debiter_credits", "record_vision_read", "record_vision_refus",
        "record_upload_retry", "reserver_notification", "ondemand_circuit_ouvert",
    }
    manquantes = attendues - au_manifeste
    assert not manquantes, f"Fonctions disparues du manifeste : {sorted(manquantes)}"
