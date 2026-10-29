# Assistant intelligent RAG - Guide d'utilisation Soft Transit Web

Ce projet contient l'assistant virtuel RAG (Retrieval-Augmented Generation) pour guider l'utilisation du logiciel de gestion de transit et douane **Soft Transit Web**. L'assistant permet aux utilisateurs de poser des questions à l'écrit ou par synthèse vocale (micro) et d'obtenir des réponses basées sur le manuel officiel (PDF) et le guide vidéo de formation (MP4). Il affiche des captures d'écrans pertinentes de l'application correspondantes aux explications.

Le widget de chat a été isolé pour être transparent et intégrable facilement en tant que popup dans votre application de production existante.

---

## Structure du Projet

```text
├── backend/                   # Serveur Node.js / Express
│   ├── prep_rag.js            # Préparation et indexation du PDF dans Firestore
│   ├── analyze_video.py       # Extraction des chapitres vidéo avec Gemini 3.5 et FFmpeg
│   ├── index_video.js         # Indexation des segments vidéo dans Firestore
│   ├── server.js              # Serveur API de chat assistant RAG et synthèse
│   └── public/screenshots/    # Dossier stockant les captures d'écran du manuel et de la vidéo
├── frontend/                  # Application React (Vite)
│   ├── src/components/        # Widget AssistantPopup (floating button + chat window)
│   └── src/App.jsx            # Point d'entrée épuré (affiche uniquement le widget)
└── SOFT_TRANSIT_WEB_GUIDE_UTILISATION.pdf # Manuel d'utilisation source
```

---

## Déploiement du Frontend sur Cloudflare Pages

1. **Création du projet Cloudflare Pages** :
   - Connectez votre compte GitHub et sélectionnez votre dépôt `mbndiaye232/guidestransit`.
2. **Configuration du Build** :
   - **Framework preset** : `Vite` (ou aucun)
   - **Root directory** : `frontend`
   - **Build command** : `npm run build`
   - **Build output directory** : `dist`
 3. **Configuration de la variable d'environnement (Crucial)** :
   - Dans les paramètres de build de Cloudflare Pages, ajoutez la variable d'environnement suivante pour lier le frontend à votre serveur de production backend (Render.com) :
     - Clé : `VITE_API_BASE_URL`
     - Valeur : `https://votre-backend-assistant.onrender.com` *(Remplacez par l'URL de votre Web Service sur Render)*

---

## Déploiement du Backend sur Render.com

Le serveur RAG Node.js s'exécute sous forme de **Web Service** sur Render.com.

1. **Création du Web Service** :
   - Connectez votre compte GitHub sur Render.com et créez un nouveau **Web Service**.
   - Sélectionnez votre dépôt `mbndiaye232/guidestransit`.
2. **Configuration du Web Service** :
   - **Name** : `soft-transit-assistant-backend` (ou le nom de votre choix)
   - **Root Directory** : `backend`
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
 3. **Configuration des variables d'environnement (Environment Variables)** :
    - Ajoutez les variables d'environnement suivantes dans les paramètres du Web Service :
      - `GEMINI_API_KEY` : `votre_cle_api_gemini_ici`
      - `FIRESTORE_DATABASE_ID` : `nom_de_votre_base_firestore` (ex: 'guidesofttransit')
      - `FIRESTORE_COLLECTION` : `nom_de_la_collection` (ex: 'rag_chunks')

---

## Exécution Locale (Développement)

### 1. Démarrer le Backend
- Allez dans le dossier `backend`.
- Installez les packages : `npm install`.
- Assurez-vous d'avoir configuré le fichier `.env` avec vos clés API Gemini et Firestore.
- Lancez le serveur : `npm start`. Il tournera sur `http://127.0.0.1:5001`.

### 2. Démarrer le Frontend
- Allez dans le dossier `frontend`.
- Installez les packages : `npm install`.
- Démarrez en mode développement : `npm run dev`. Le widget sera accessible localement sur `http://127.0.0.1:3001` (avec fond transparent pour tester les intégrations).

---

## Mettre à jour les connaissances de l'assistant

L'assistant répond à partir de la collection Firestore définie par `FIRESTORE_COLLECTION`. Pour la mettre à jour **sans risque** (la collection en service n'est jamais modifiée) :

1. **Sauvegarder** la collection actuelle (lecture seule) : `node sauvegarde_rag.js` (fichier dans `backups/`, vecteurs inclus).
2. **Préparer le contenu** : placer le nouveau guide PDF à la racine, adapter `GUIDE_OCTOBRE` et la liste `CONSERVES_JUIN` (pages de l'ancien guide à garder) dans `construire_chunks_2026.py`, puis `python construire_chunks_2026.py` (écrit `rag_2026_chunks.json` et les images `public/screenshots/g2_page_N.jpg`).
3. **Indexer dans une NOUVELLE collection** : `node prep_rag_2026.js <nouvelle-collection> backups/<sauvegarde>.json` (`--dry-run` pour simuler). Le script refuse la collection en service et toute collection non vide.
4. **Tester** : lancer le serveur avec `FIRESTORE_COLLECTION=<nouvelle-collection>` sur un autre port et poser des questions types (POST `/api/assistant/chat`).
5. **Déployer** : pousser les nouvelles images (le backend Render les sert depuis `public/screenshots`), puis changer `FIRESTORE_COLLECTION` dans les variables d'environnement du service Render et redéployer. Retour arrière : remettre l'ancienne valeur.

⚠ `prep_rag.js` (premier script) **vide la collection avant de la reconstruire** : ne pas l'utiliser pour une mise à jour.

### Ajouter les vidéos du guide (YouTube) aux connaissances

Les segments vidéo (une entrée par partie de vidéo, avec lien YouTube horodaté) s'ajoutent **sans toucher aux autres documents** :

1. `python backend/construire_chunks_videos_2026.py <dossier remotion-pilote>` : écrit `backend/rag_videos_2026_chunks.json` (chronologie réelle des scènes, voix en cache).
2. `node sauvegarde_rag.js <collection>` puis `node ajout_videos_2026.js <collection-de-test>` pour essayer, enfin `node ajout_videos_2026.js <collection-en-service>` (`--dry-run` pour simuler).
3. Retour arrière : `node ajout_videos_2026.js <collection> --retirer` (supprime seulement les documents `yt_…`).
