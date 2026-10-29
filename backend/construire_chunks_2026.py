"""Construit le contenu de la mise à jour 2026-10 de l'assistant : pages du guide d'octobre + pages de juin conservées.

Sortie (aucune écriture dans Firestore) :
  - backend/rag_2026_chunks.json : { nouveaux: [pages d'octobre à vectoriser], conserves_juin: [numéros de pages de juin gardées] }
  - backend/public/screenshots/g2_page_N.jpg : image de chaque page d'octobre (JPEG 110 dpi, qualité 72)
Usage : python construire_chunks_2026.py
"""
import json
import os
import re

import fitz  # PyMuPDF

ICI = os.path.dirname(os.path.abspath(__file__))
GUIDE_OCTOBRE = os.path.join(ICI, "..", "GUIDE_UTILISATION_SOFT_TRANSIT_2026_10.pdf")
SORTIE_IMG = os.path.join(ICI, "public", "screenshots")

# Pages du guide de juin à conserver : sujets absents du guide d'octobre (vérifiés mot à mot dans les deux guides).
CONSERVES_JUIN = {
    19: "Gestion électronique des documents (GED)",
    28: "Types de factures (tiers, client, globales FG)",
    29: "Factures globales (FG)",
    31: "Envoi des factures : saisie manuelle des rubriques, validation",
    34: "Annulation de factures",
    35: "Cotations et devis",
    40: "Règlements : annuler un règlement, dépôt (acompte)",
    41: "Règlements : dépôt (acompte), solde créditeur du compte client",
    42: "Règlements (suite)",
    43: "États financiers : balance âgée, chiffres d'affaires, grand livre, état client",
    44: "États financiers : relevé de compte",
    57: "Sommiers : historique, actions spéciales",
    58: "Sommiers : droits d'accès",
    59: "Sommiers : bonnes pratiques ; paramètres : comptes mails",
    60: "Paramètres : statuts juridiques, incoterms, groupes",
    61: "Paramètres : modes de règlement, types de documents, unités, rubriques",
    63: "Paramètres : devises, moyens de transport, lieux, domaines d'activités",
    64: "Paramètres : domaines d'activités, codes couleurs des alertes",
    67: "Annexes",
    68: "Annexe B : codification des documents",
}


def nettoyer(texte):
    """Retire le pied de page répété, la pagination, et recolle les titres en lettres espacées (« C H A P I T R E 1 2 » -> « CHAPITRE 12 »)."""
    lignes = []
    for l in texte.split("\n"):
        l = l.strip()
        if not l or "S O F T S E R V I C E S" in l or l.startswith("© 2026 Soft Services") or re.fullmatch(r"Page \d+ sur \d+", l):
            continue
        l = re.sub(r"(?<![A-Za-zÀ-ÿ0-9])((?:[A-ZÉÈÀ0-9] ){3,}[A-ZÉÈÀ0-9])(?![A-Za-zÀ-ÿ0-9])", lambda m: m.group(1).replace(" ", ""), l)
        lignes.append(l)
    return "\n".join(lignes)


def est_sommaire(texte):
    return len(re.findall(r"\.{6,}", texte)) >= 5 or "Sommaire" in texte[:200]


def main():
    doc = fitz.open(GUIDE_OCTOBRE)
    os.makedirs(SORTIE_IMG, exist_ok=True)
    nouveaux, ignorees = [], []
    for i, page in enumerate(doc, 1):
        brut = re.sub(r"[ \t]+", " ", page.get_text()).strip()
        texte = nettoyer(brut)
        if i == 1 or len(texte) < 200 or est_sommaire(brut):
            ignorees.append(i)
            continue
        page.get_pixmap(dpi=110).save(os.path.join(SORTIE_IMG, f"g2_page_{i}.jpg"), jpg_quality=72)
        nouveaux.append({
            "id": f"oct_page_{i}",
            "text": f"[Guide d'utilisation 2026 – Page {i}] {texte}",
            "source": "pdf",
            "pageNumber": i,
            "screenshotUrl": f"/screenshots/g2_page_{i}.jpg",
            "title": f"Guide d'utilisation 2026 - Page {i}",
        })
    with open(os.path.join(ICI, "rag_2026_chunks.json"), "w", encoding="utf-8") as f:
        json.dump({"nouveaux": nouveaux, "conserves_juin": {str(k): v for k, v in CONSERVES_JUIN.items()}}, f, ensure_ascii=False, indent=1)
    taille = sum(os.path.getsize(os.path.join(SORTIE_IMG, f"g2_page_{c['pageNumber']}.jpg")) for c in nouveaux) / 1e6
    print(f"Pages d'octobre indexables : {len(nouveaux)} (ignorées : couverture, sommaire, pages vides -> {ignorees})")
    print(f"Pages de juin conservées : {len(CONSERVES_JUIN)}")
    print(f"Images : {taille:.1f} Mo dans {os.path.normpath(SORTIE_IMG)}")


if __name__ == "__main__":
    main()
