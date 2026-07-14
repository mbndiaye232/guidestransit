# Assistant intelligent RAG - Guide d'utilisation Soft Transit Web

Ce projet contient l'assistant virtuel RAG (Retrieval-Augmented Generation) pour guider l'utilisation du logiciel de gestion de transit et douane **Soft Transit Web**. L'assistant permet aux utilisateurs de poser des questions à l'écrit ou par synthèse vocale (micro) et d'obtenir des réponses basées sur le manuel officiel (PDF) et le guide vidéo de formation (MP4). Il affiche des captures d'écrans pertinentes de l'application correspondantes aux explications.

Le widget de chat a été isolé pour être transparent et intégrable facilement en tant que popup dans votre application de production existante.

---

## Structure du Projet

```text
├── backend/                   # Serveur Node.js / Express
│   ├── prep_rag.js            # Préparation et indexation du PDF dans Pinecone
│   ├── analyze_video.py       # Extraction des chapitres vidéo avec Gemini 3.5 et FFmpeg
│   ├── index_video.js         # Indexation des segments vidéo dans Pinecone
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
   - Dans les paramètres de build de Cloudflare Pages, ajoutez la variable d'environnement suivante pour lier le frontend à votre serveur de production backend (OVH) :
     - Clé : `VITE_API_BASE_URL`
     - Valeur : `https://votre-backend-ovh.com` *(Remplacez par l'URL de votre serveur Node.js hébergé sur OVH)*

---

## Déploiement du Backend sur OVH

Le serveur RAG Node.js s'exécute en arrière-plan et effectue les recherches de similarité sur Pinecone.

1. **Prérequis** :
   - Assurez-vous que Node.js (v18+) et Python 3 sont installés sur votre instance OVH.
2. **Fichiers** :
   - Transférez le contenu du dossier `backend/` sur votre serveur OVH.
3. **Configuration des variables d'environnement** :
   - Créez un fichier `.env` dans le répertoire `backend/` de production :
     ```ini
     PORT=5001
     GEMINI_API_KEY=votre_cle_api_gemini
     PINECONE_API_KEY=votre_cle_api_pinecone
     PINECONE_INDEX_NAME=clef-guide-soft-transit
     ```
4. **Démarrage du Serveur** :
   - Installez les dépendances : `npm install`
   - Démarrez le serveur (il est recommandé d'utiliser `pm2` pour le maintenir actif en arrière-plan) :
     ```bash
     npm install -g pm2
     pm2 start server.js --name "soft-transit-rag-backend"
     ```

---

## Exécution Locale (Développement)

### 1. Démarrer le Backend
- Allez dans le dossier `backend`.
- Installez les packages : `npm install`.
- Assurez-vous d'avoir configuré le fichier `.env` avec vos clés API Gemini et Pinecone.
- Lancez le serveur : `npm start`. Il tournera sur `http://127.0.0.1:5001`.

### 2. Démarrer le Frontend
- Allez dans le dossier `frontend`.
- Installez les packages : `npm install`.
- Démarrez en mode développement : `npm run dev`. Le widget sera accessible localement sur `http://127.0.0.1:3001` (avec fond transparent pour tester les intégrations).
