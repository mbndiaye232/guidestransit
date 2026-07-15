import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, 'video_chunks.json');
const COLLECTION_NAME = process.env.FIRESTORE_COLLECTION || 'rag_chunks';

if (!fs.existsSync(JSON_PATH)) {
  console.error(`Erreur: Le fichier ${JSON_PATH} n'existe pas. Veuillez d'abord exécuter analyze_video.py.`);
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error("Erreur: GEMINI_API_KEY n'est pas configuré dans le fichier .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

async function run() {
  try {
    console.log("=== Démarrage de l'indexation de la vidéo ===");
    
    // 1. Lire le JSON
    const rawData = fs.readFileSync(JSON_PATH, 'utf-8');
    const chunks = JSON.parse(rawData);
    console.log(`Chargement de ${chunks.length} chunks vidéo depuis ${JSON_PATH}.`);

    // 2. Connexion à Firestore
    console.log("Connexion à Firestore...");
    const db = new Firestore({
      databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)'
    });
    const collectionRef = db.collection(COLLECTION_NAME);

    // 3. Générer les embeddings et insérer par lots de 10
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`Traitement du lot ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}...`);
      
      const dbBatch = db.batch();
      let batchCount = 0;
      
      for (const chunk of batch) {
        try {
          const ts = chunk.timestamp_seconds;
          const timeStr = chunk.time_string;
          const title = chunk.title;
          const desc = chunk.description;
          const inst = chunk.instructions;

          // Construire le texte enrichi pour le RAG
          const textToEmbed = `[Guide Vidéo - ${timeStr}] ${title}\n\nDescription de l'écran : ${desc}\n\nInstructions d'utilisation : ${inst}`;

          console.log(`  Embedding du chunk "${title}" (${timeStr})...`);
          const embedResult = await embeddingModel.embedContent({
            content: { parts: [{ text: textToEmbed }] },
            outputDimensionality: 768
          });
          const values = embedResult.embedding.values;

          const docRef = collectionRef.doc(`video_timestamp_${ts}`);
          dbBatch.set(docRef, {
            text: textToEmbed,
            source: 'video',
            pageNumber: 0,
            screenshotUrl: `/screenshots/video_frame_${ts}.png`,
            title: `Guide Vidéo - ${title} (${timeStr})`,
            embedding: FieldValue.vector(values)
          });
          batchCount++;
        } catch (err) {
          console.error(`Erreur d'embedding pour le chunk "${chunk.title}":`, err);
        }
      }
      
      if (batchCount > 0) {
        await dbBatch.commit();
        console.log(`  ✓ Lot de ${batchCount} vecteurs insérés dans Firestore.`);
      }
    }

    console.log("=== Indexation de la vidéo RAG terminée avec succès ===");
  } catch (error) {
    console.error("Erreur globale lors de l'indexation RAG de la vidéo :", error);
  }
}

run();
