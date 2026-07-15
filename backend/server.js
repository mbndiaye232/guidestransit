import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import speech from '@google-cloud/speech';
import textToSpeech from '@google-cloud/text-to-speech';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const COLLECTION_NAME = process.env.FIRESTORE_COLLECTION || 'rag_chunks';

app.use(cors());
app.use(express.json());

// Servir les captures d'écran du dossier public
app.use('/screenshots', express.static('public/screenshots'));

// Configurer Multer pour l'upload d'enregistrements audio en mémoire
const upload = multer({ storage: multer.memoryStorage() });

// Initialisation des SDK
let db;
let genAI;
let embeddingModel;
let chatModel;
let speechClient;
let ttsClient;

try {
  // Initialiser Firestore
  db = new Firestore({ databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)' });

  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    chatModel = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
  } else {
    console.warn("⚠️ GEMINI_API_KEY n'est pas défini.");
  }

  // Google Cloud Speech & TTS s'initialisent automatiquement avec GOOGLE_APPLICATION_CREDENTIALS défini dans .env
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    speechClient = new speech.SpeechClient();
    ttsClient = new textToSpeech.TextToSpeechClient();
  } else {
    console.warn("⚠️ GOOGLE_APPLICATION_CREDENTIALS n'est pas défini. Les fonctionnalités vocales Google Cloud utiliseront un fallback.");
  }
} catch (error) {
  console.error("Erreur d'initialisation des services :", error);
}

// 1. Endpoint principal Chat RAG
app.post('/api/assistant/chat', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: "Le champ 'message' est requis." });
  }

  try {
    if (!db || !genAI) {
      return res.status(500).json({ error: "Les API Gemini ou Firestore ne sont pas correctement configurées." });
    }

    console.log(`Question de l'utilisateur : "${message}"`);

    // A. Générer l'embedding de la question (768 dimensions pour Firestore)
    const embedResult = await embeddingModel.embedContent({
      content: { parts: [{ text: message }] },
      outputDimensionality: 768
    });
    const queryVector = embedResult.embedding.values;

    // B. Interroger Firestore pour récupérer les 3 chunks les plus similaires
    // Note: Si l'index de recherche vectorielle n'existe pas, Firestore renverra une erreur contenant un lien.
    const snapshot = await db.collection(COLLECTION_NAME)
      .findNearest('embedding', FieldValue.vector(queryVector), {
        limit: 3,
        distanceMeasure: 'COSINE',
        distanceResultField: 'vector_distance'
      })
      .get();

    const matches = [];
    snapshot.forEach(doc => {
      matches.push({
        id: doc.id,
        metadata: doc.data(),
        // Dans Firestore, la distance cosinus varie de 0.0 (identique) à 2.0 (opposé).
        // Plus la distance est proche de 0, plus les vecteurs sont proches.
        // Un score de similarité cosinus de 0.3 (Pinecone) correspond à une distance cosinus < 0.7 dans Firestore.
        distance: doc.data().vector_distance
      });
    });
    
    // C. Extraire le contexte et les captures d'écran associées
    let context = '';
    const screenshots = [];

    matches.forEach(match => {
      // Seuil de pertinence : distance < 0.7 (équivalent à similarité > 0.3)
      if (match.metadata && (match.distance === undefined || match.distance < 0.7)) {
        context += `${match.metadata.text}\n\n`;
        
        // Ajouter la capture d'écran si elle existe et n'est pas déjà dans la liste
        if (match.metadata.screenshotUrl && !screenshots.some(s => s.url === match.metadata.screenshotUrl)) {
          screenshots.push({
            pageNumber: match.metadata.pageNumber,
            url: match.metadata.screenshotUrl,
            title: match.metadata.title
          });
        }
      }
    });

    if (!context) {
      context = "Aucune information pertinente n'a été trouvée dans le manuel d'utilisation.";
    }

    // D. Générer la réponse finale avec Gemini
    const systemPrompt = `Tu es l'assistant de support et d'aide à l'utilisation du logiciel "Soft Transit". 
Ton rôle est de guider l'utilisateur pas à pas en te basant uniquement sur le contexte extrait du manuel d'utilisation officiel fourni ci-dessous.
Sois concis, clair, poli et professionnel. Répond exclusivement en français.
Si la réponse à la question n'est pas présente dans le contexte, réponds poliment que tu ne trouves pas cette information dans le manuel d'utilisation et propose de contacter le support à sst@sst.best.

CONTEXTE D'UTILISATION :
${context}`;

    const chatResult = await chatModel.generateContent([
      systemPrompt,
      `Question de l'utilisateur: ${message}`
    ]);
    
    const replyText = chatResult.response.text();

    res.json({
      text: replyText,
      screenshots: screenshots
    });

  } catch (error) {
    console.error("Erreur dans /api/assistant/chat :", error);
    res.status(500).json({ error: "Une erreur est survenue lors du traitement du message." });
  }
});

// 2. Endpoint Speech-to-Text (STT)
app.post('/api/assistant/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Aucun fichier audio reçu." });
  }

  try {
    if (!speechClient) {
      console.warn("SpeechClient non initialisé, utilisation du fallback.");
      return res.status(501).json({ error: "Reconnaissance vocale non configurée sur le serveur. Veuillez configurer GOOGLE_APPLICATION_CREDENTIALS." });
    }

    console.log("Transcription audio reçue...");
    const audioBytes = req.file.buffer.toString('base64');
    
    const audio = { content: audioBytes };
    
    const config = {
      encoding: 'WEBM_OPUS', // Format WebM d'enregistrement standard des navigateurs récents
      sampleRateHertz: 48000,
      languageCode: 'fr-FR',
    };

    const request = { audio, config };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    console.log(`Transcription réussie : "${transcription}"`);
    res.json({ text: transcription });

  } catch (error) {
    console.error("Erreur dans /api/assistant/stt :", error);
    res.status(500).json({ error: "Erreur lors de la transcription audio." });
  }
});

// 3. Endpoint Text-to-Speech (TTS)
app.post('/api/assistant/tts', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Le champ 'text' est requis." });
  }

  try {
    if (!ttsClient) {
      console.warn("TTS Client non initialisé, utilisation du fallback.");
      return res.status(501).json({ error: "Synthèse vocale non configurée sur le serveur. Veuillez configurer GOOGLE_APPLICATION_CREDENTIALS." });
    }

    const cleanText = text.replace(/\*/g, '');
    const request = {
      input: { text: cleanText },
      voice: { 
        languageCode: 'fr-FR', 
        name: 'fr-FR-Standard-C', // Voix française claire
        ssmlGender: 'FEMALE' 
      },
      audioConfig: { audioEncoding: 'MP3' },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    
    // Renvoyer le fichier audio binaire directement
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.audioContent.length
    });
    res.send(response.audioContent);

  } catch (error) {
    console.error("Erreur dans /api/assistant/tts :", error);
    res.status(500).json({ error: "Erreur lors de la synthèse vocale." });
  }
});

// Lancer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur de l'assistant Soft Transit démarré sur http://localhost:${PORT}`);
});
