"""Construit les entrées de l'assistant pour les 11 modules vidéo Soft Transit (guide d'utilisation vidéo, YouTube).

Une entrée par partie de vidéo : narration de la scène + lien YouTube positionné à la bonne seconde. Aucune écriture dans Firestore.
Les débuts de scènes viennent de la chronologie réelle de chaque module (prepare.py du projet Remotion, voix en cache).

Usage : python construire_chunks_videos_2026.py <dossier remotion-pilote>
Sortie : backend/rag_videos_2026_chunks.json
"""
import json
import os
import re
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
PLAYLIST = "PLESnikCnIJ-k"
# ordre de la playlist : (module Remotion, identifiant YouTube, titre court)
SERIE = [
    ("connexion-tableau-de-bord", "xtjD5SP7xRw", "Connexion et tableau de bord"),
    ("clients-tiers", "Xc2u1luxVt0", "Clients et tiers"),
    ("ouvrir-dossier", "2F_BzJFE_Fo", "Ouvrir un dossier"),
    ("preparer-transport", "wPRtAQKySMk", "Préparer le transport"),
    ("droits-taxes", "AUk9oy0HK_8", "Droits et taxes"),
    ("livraison", "yl-Qfho9eIo", "Livraison"),
    ("facturation-reglements", "C9_dIKCqouY", "Facturation et règlements"),
    ("sommiers-apurements", "5q3C6t22ke8", "Sommiers et apurements"),
    ("parametrage", "AAGQLPKcudg", "Paramétrage"),
    ("sauvegardes", "KZtp2QPvfu4", "Les sauvegardes"),
    ("portail-client", "I_VNv8IoZGU", "Le portail client"),
]


def dessiger(texte):
    """« D P I » -> « DPI » : la narration épelle les sigles pour la voix, pas pour la recherche."""
    return re.sub(r"\b(?:[A-Z] ){1,}[A-Z]\b", lambda m: m.group(0).replace(" ", ""), texte)


def main(dossier):
    os.chdir(dossier)
    chunks = []
    for num, (module, video, court) in enumerate(SERIE, 1):
        sub = subprocess.run([sys.executable, "scripts/prepare.py", module], capture_output=True)
        if sub.returncode != 0:
            sys.exit(f"prepare.py a échoué pour {module}: {sub.stderr.decode('utf-8', 'replace')[-300:]}")
        tl = json.load(open(os.path.join("src", "timeline.json"), encoding="utf-8"))
        scenario = json.load(open(os.path.join("modules", f"{module}.json"), encoding="utf-8"))
        debut = {s["id"]: s["debut"] / tl["fps"] for s in tl["scenes"]}
        for sc in scenario["scenes"]:
            if sc["type"] == "fin" or sc["id"] not in debut:
                continue
            narration = dessiger(" ".join(p["texte"] for p in sc["phrases"]))
            # le rang cité par la voix (« deuxième module ») ne suit pas l'ordre de la playlist : on le retire
            narration = re.sub(r"Bonjour, et bienvenue dans ce \w+ module[^.]*\.\s*", "", narration)
            etape = sc.get("etape") or "Introduction"
            sec = int(debut[sc["id"]])
            lien = f"https://youtu.be/{video}?t={sec}"
            chunks.append({
                "id": f"yt_m{num:02d}_{sc['id']}",
                "text": (f"[Vidéo guide Soft Transit – Module {num} : {court} – {etape}] {narration} "
                         f"Cette partie est expliquée dans la vidéo, à {sec // 60}:{sec % 60:02d} : {lien} "
                         f"(toute la série en lecture continue : https://www.youtube.com/watch?v=xtjD5SP7xRw&list={PLAYLIST})"),
                "source": "video",
                "pageNumber": 0,
                "screenshotUrl": "",
                "title": f"Vidéo – Module {num} : {court} ({etape})",
            })
        print(f"module {num:2} {module:28} {sum(1 for c in chunks if c['id'].startswith(f'yt_m{num:02d}_'))} parties")
    sortie = os.path.join(ICI, "rag_videos_2026_chunks.json")
    json.dump({"chunks": chunks}, open(sortie, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(chunks)} entrées écrites dans {sortie}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
