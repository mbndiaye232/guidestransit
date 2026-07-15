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
